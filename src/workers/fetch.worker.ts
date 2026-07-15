import { config } from 'dotenv';
config();

import { createHash } from 'crypto';
import { Worker, Queue } from 'bullmq';
import { eq, lt, and } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import Redis from 'ioredis';
import { Pool } from 'pg';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import robotsParser from 'robots-parser';
import { diffLines } from 'diff';
import { errorMessage } from '../common/error-message.js';
import * as schema from '../db/schema.js';
import { llmComplete, tryParseJson } from '../llm/llm-complete.js';
import { browserScrape } from '../scrape/browser-scrape.js';
import {
  normalizeUrl,
  isAllowedByPatterns,
  isSameDomain,
} from './url-helpers.js';

const {
  jobs,
  job_pages,
  monitors,
  monitor_pages,
  monitor_checks,
  monitor_changes,
  logs,
} = schema;

// ── Config ────────────────────────────────────────────────────────────────────
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/quarry';
const POLITENESS_MS = parseInt(process.env.POLITENESS_MS ?? '300', 10);
const FETCH_TIMEOUT_MS = 15_000;
const SITEMAP_TIMEOUT_MS = 30_000;
const USER_AGENT = 'Quarry/0.1 (web scraper)';
const LOG_RETENTION_DAYS = parseInt(process.env.LOG_RETENTION_DAYS ?? '30', 10);

// ── Connections ───────────────────────────────────────────────────────────────
// Raw ioredis client for frontier/visited set operations
const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
// Plain URL options for BullMQ (avoids ioredis version conflicts with BullMQ's peer dep)
const bullConnection = { url: REDIS_URL };
const pool = new Pool({ connectionString: DATABASE_URL });
const db = drizzle(pool, { schema });
const crawlQueue = new Queue('crawl', { connection: bullConnection });
const maintenanceQueue = new Queue('maintenance', {
  connection: bullConnection,
});

// ── Shared tooling ────────────────────────────────────────────────────────────
const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});
const domainTimings = new Map<string, number>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function enforcePoliteness(url: string): Promise<void> {
  const domain = new URL(url).hostname;
  const last = domainTimings.get(domain) ?? 0;
  const wait = POLITENESS_MS - (Date.now() - last);
  if (wait > 0) await sleep(wait);
  domainTimings.set(domain, Date.now());
}

async function fetchRobots(
  siteUrl: string,
): Promise<ReturnType<typeof robotsParser>> {
  const robotsUrl = new URL('/robots.txt', siteUrl).toString();
  try {
    const res = await fetch(robotsUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(5_000),
    });
    const text = res.ok ? await res.text() : '';
    return robotsParser(robotsUrl, text);
  } catch {
    return robotsParser(robotsUrl, '');
  }
}

type FetchedPage = {
  status: 'scraped' | 'not_found' | 'blocked' | 'timeout' | 'error';
  markdown?: string;
  title?: string;
  links?: string[];
  error?: string;
  etag?: string;
  lastModified?: string;
};

async function fetchPage(
  url: string,
  conditionalHeaders?: { etag?: string | null; lastModified?: string | null },
): Promise<FetchedPage & { unchanged?: boolean }> {
  await enforcePoliteness(url);

  const headers: Record<string, string> = { 'User-Agent': USER_AGENT };
  if (conditionalHeaders?.etag)
    headers['If-None-Match'] = conditionalHeaders.etag;
  if (conditionalHeaders?.lastModified)
    headers['If-Modified-Since'] = conditionalHeaders.lastModified;

  let res: Response;
  try {
    res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err: unknown) {
    const msg = errorMessage(err);
    if (msg.includes('TimeoutError') || msg.includes('abort')) {
      return { status: 'timeout', error: 'Request timed out' };
    }
    return { status: 'error', error: msg };
  }

  if (res.status === 304) return { status: 'scraped', unchanged: true };
  if (res.status === 404) return { status: 'not_found', error: 'HTTP 404' };
  if (res.status === 403 || res.status === 429)
    return { status: 'blocked', error: `HTTP ${res.status}` };
  if (!res.ok) return { status: 'error', error: `HTTP ${res.status}` };

  const html = await res.text();
  const $ = cheerio.load(html);
  $('script, style, noscript, iframe, svg').remove();

  const title = $('title').text().trim();
  const bodyHtml = $('body').html() ?? '';
  const markdown = turndown.turndown(bodyHtml);

  const links: string[] = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (href) links.push(href);
  });

  if (markdown.length < 150 && process.env.BROWSER_WS_ENDPOINT) {
    try {
      const browser = await browserScrape(url);
      return {
        status: 'scraped',
        markdown: browser.markdown,
        title: browser.title,
        links: browser.links,
        etag: res.headers.get('etag') ?? undefined,
        lastModified: res.headers.get('last-modified') ?? undefined,
      };
    } catch {
      /* fall through to fetch result */
    }
  }

  return {
    status: 'scraped',
    markdown,
    title,
    links,
    etag: res.headers.get('etag') ?? undefined,
    lastModified: res.headers.get('last-modified') ?? undefined,
  };
}

interface FrontierItem {
  url: string;
  depth: number;
}

interface CrawlJobData {
  jobId: string;
  url: string;
  maxDepth: number;
  maxPages: number;
  includePatterns: string[];
  excludePatterns: string[];
  webhookUrl?: string;
  engine?: 'fetch' | 'browser' | 'auto';
}

interface MonitorJobData {
  monitorId: string;
}

async function fetchSitemapText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(SITEMAP_TIMEOUT_MS),
    });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

function extractLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*(https?:\/\/[^<]+?)\s*<\/loc>/gi)].map(
    ([, u]) => u.trim(),
  );
}

async function discoverFromSitemap(
  siteUrl: string,
  maxCandidates: number,
  include: string[],
  exclude: string[],
  robots: ReturnType<typeof robotsParser>,
): Promise<string[] | null> {
  const rootText = await fetchSitemapText(
    new URL('/sitemap.xml', siteUrl).toString(),
  );
  if (!rootText) return null;

  const pageUrls: string[] = [];
  const isSitemapIndex = /<sitemapindex[\s>]/i.test(rootText);

  if (isSitemapIndex) {
    // Root is a sitemap index — fetch each child sitemap and collect page URLs from them
    const childSitemapUrls = extractLocs(rootText).filter((u) =>
      u.endsWith('.xml'),
    );
    for (const childUrl of childSitemapUrls) {
      const childText = await fetchSitemapText(childUrl);
      if (!childText) continue;
      for (const u of extractLocs(childText)) {
        if (!u.endsWith('.xml')) pageUrls.push(u);
      }
    }
  } else {
    for (const u of extractLocs(rootText)) {
      if (!u.endsWith('.xml')) pageUrls.push(u);
    }
  }

  const urls: string[] = [];
  for (const raw of pageUrls) {
    const normalized = normalizeUrl(raw, siteUrl);
    if (!normalized) continue;
    if (!isSameDomain(normalized, siteUrl)) continue;
    if (!robots.isAllowed(normalized, USER_AGENT)) continue;
    if (!isAllowedByPatterns(normalized, include, exclude)) continue;
    urls.push(normalized);
    if (urls.length >= maxCandidates) break;
  }

  return urls.length > 0 ? urls : null;
}

// ── Core crawl logic (shared by regular crawl + monitor runs) ─────────────────
async function runCrawl(opts: {
  jobId: string;
  url: string;
  maxDepth: number;
  maxPages: number;
  includePatterns: string[];
  excludePatterns: string[];
  monitorId?: string;
  engine?: 'fetch' | 'browser' | 'auto';
}): Promise<{
  pagesScraped: number;
  pagesFailed: number;
  changedPages?: Array<{ url: string; diff: string }>;
}> {
  const {
    jobId,
    url,
    maxDepth,
    maxPages,
    includePatterns,
    excludePatterns,
    monitorId,
    engine = 'auto',
  } = opts;

  const frontierKey = `crawl:${jobId}:frontier`;
  const visitedKey = `crawl:${jobId}:visited`;
  await redis.del(frontierKey, visitedKey);

  const robots = await fetchRobots(url);

  // Load previous monitor page hashes if this is a monitor run
  const monitorPageCache: Map<
    string,
    { etag: string | null; lastModified: string | null; hash: string | null }
  > = new Map();
  if (monitorId) {
    const existing = await db
      .select()
      .from(monitor_pages)
      .where(eq(monitor_pages.monitor_id, monitorId));
    for (const mp of existing) {
      monitorPageCache.set(mp.url, {
        etag: mp.last_etag,
        lastModified: mp.last_modified,
        hash: mp.last_content_hash,
      });
    }
  }

  // Discover URLs via sitemap or root
  const sitemapUrls = await discoverFromSitemap(
    url,
    maxPages * 3,
    includePatterns,
    excludePatterns,
    robots,
  );
  let usesSitemap = false;

  if (sitemapUrls) {
    usesSitemap = true;
    const capped = sitemapUrls.slice(0, maxPages);
    if (capped.length > 0) {
      await redis.rpush(
        frontierKey,
        ...capped.map((u) => JSON.stringify({ url: u, depth: 0 })),
      );
      for (const u of capped) await redis.sadd(visitedKey, u);
    }
    await db
      .update(jobs)
      .set({ pages_discovered: capped.length })
      .where(eq(jobs.id, jobId));
  } else {
    const normalized = normalizeUrl(url, url);
    if (normalized) {
      await redis.rpush(
        frontierKey,
        JSON.stringify({ url: normalized, depth: 0 }),
      );
      await redis.sadd(visitedKey, normalized);
      await db
        .update(jobs)
        .set({ pages_discovered: 1 })
        .where(eq(jobs.id, jobId));
    }
  }

  let pagesScraped = 0;
  let pagesFailed = 0;
  const changedPages: Array<{ url: string; diff: string }> = [];
  // Track which domains tripped the blocked backoff
  const backoffUntil = new Map<string, number>();

  while (pagesScraped + pagesFailed < maxPages) {
    const raw = await redis.lpop(frontierKey);
    if (!raw) break;

    const item = JSON.parse(raw) as FrontierItem;

    // Skip if domain is in backoff window
    const domain = new URL(item.url).hostname;
    const backoff = backoffUntil.get(domain) ?? 0;
    if (Date.now() < backoff) {
      pagesFailed++;
      await db.insert(job_pages).values({
        job_id: jobId,
        url: item.url,
        status: 'blocked',
        engine: 'fetch',
        error: 'Domain in backoff window',
        scraped_at: new Date(),
      });
      continue;
    }

    const cached = monitorId ? monitorPageCache.get(item.url) : undefined;
    const t0 = Date.now();

    let result: FetchedPage & { unchanged?: boolean };
    let usedEngine: 'fetch' | 'browser' = 'fetch';

    if (engine === 'browser') {
      // Force browser for all pages
      try {
        const b = await browserScrape(item.url);
        result = {
          status: 'scraped',
          markdown: b.markdown,
          title: b.title,
          links: b.links,
        };
        usedEngine = 'browser';
      } catch (err: unknown) {
        result = {
          status: 'error',
          error: errorMessage(err),
        };
      }
    } else {
      result = await fetchPage(
        item.url,
        cached
          ? { etag: cached.etag, lastModified: cached.lastModified }
          : undefined,
      );

      // Auto: retry with browser if blocked or content is suspiciously thin
      if (
        engine === 'auto' &&
        process.env.BROWSER_WS_ENDPOINT &&
        (result.status === 'blocked' ||
          (result.status === 'scraped' && (result.markdown?.length ?? 0) < 150))
      ) {
        try {
          const b = await browserScrape(item.url);
          result = {
            status: 'scraped',
            markdown: b.markdown,
            title: b.title,
            links: b.links,
          };
          usedEngine = 'browser';
        } catch {
          /* browser also failed — keep original fetch result */
        }
      }
    }

    const duration_ms = Date.now() - t0;

    if (result.status === 'scraped' && !result.unchanged) {
      pagesScraped++;

      await db.insert(job_pages).values({
        job_id: jobId,
        url: item.url,
        status: 'scraped',
        engine: usedEngine,
        markdown: result.markdown,
        title: result.title,
        duration_ms,
        markdown_length: result.markdown?.length ?? 0,
        scraped_at: new Date(),
      });

      // Monitor diff logic
      if (monitorId && result.markdown !== undefined) {
        const newHash = createHash('sha256')
          .update(result.markdown)
          .digest('hex');
        const prev = monitorPageCache.get(item.url);

        if (prev && prev.hash && prev.hash !== newHash) {
          const diffText = diffLines(
            prev.hash === null
              ? ''
              : ((
                  await db
                    .select({ last_markdown: monitor_pages.last_markdown })
                    .from(monitor_pages)
                    .where(
                      and(
                        eq(monitor_pages.monitor_id, monitorId),
                        eq(monitor_pages.url, item.url),
                      ),
                    )
                )[0]?.last_markdown ?? ''),
            result.markdown ?? '',
          )
            .filter((c) => c.added || c.removed)
            .map((c) => (c.added ? `+${c.value}` : `-${c.value}`))
            .join('');
          changedPages.push({ url: item.url, diff: diffText });
        }

        await db
          .insert(monitor_pages)
          .values({
            monitor_id: monitorId,
            url: item.url,
            last_content_hash: newHash,
            last_markdown: result.markdown,
            last_etag: result.etag ?? null,
            last_modified: result.lastModified ?? null,
            last_checked_at: new Date(),
          })
          .onConflictDoUpdate({
            target: [monitor_pages.monitor_id, monitor_pages.url],
            set: {
              last_content_hash: newHash,
              last_markdown: result.markdown,
              last_etag: result.etag ?? null,
              last_modified: result.lastModified ?? null,
              last_checked_at: new Date(),
            },
          });
      }

      // Link extraction (only in link-following mode, within depth bounds)
      if (!usesSitemap && result.links && item.depth < maxDepth) {
        let discovered = parseInt(
          (await redis.scard(visitedKey)).toString(),
          10,
        );
        for (const href of result.links) {
          if (discovered >= maxPages * 3) break;
          const normalized = normalizeUrl(href, item.url);
          if (!normalized) continue;
          if (!isSameDomain(normalized, url)) continue;
          if (!robots.isAllowed(normalized, USER_AGENT)) continue;
          if (
            !isAllowedByPatterns(normalized, includePatterns, excludePatterns)
          )
            continue;
          const alreadySeen = await redis.sismember(visitedKey, normalized);
          if (alreadySeen) continue;
          await redis.sadd(visitedKey, normalized);
          await redis.rpush(
            frontierKey,
            JSON.stringify({ url: normalized, depth: item.depth + 1 }),
          );
          discovered++;
        }
        const newTotal = parseInt(
          (await redis.scard(visitedKey)).toString(),
          10,
        );
        await db
          .update(jobs)
          .set({ pages_discovered: newTotal })
          .where(eq(jobs.id, jobId));
      }
    } else if (result.unchanged) {
      // 304 — mark page as scraped but skip content update
      pagesScraped++;
      await db.insert(job_pages).values({
        job_id: jobId,
        url: item.url,
        status: 'scraped',
        engine: 'fetch',
        title: '(unchanged)',
        duration_ms,
        scraped_at: new Date(),
      });
    } else {
      pagesFailed++;
      await db.insert(job_pages).values({
        job_id: jobId,
        url: item.url,
        status: result.status,
        engine: 'fetch',
        error: result.error,
        duration_ms,
        scraped_at: new Date(),
      });

      if (result.status === 'blocked') {
        // Exponential backoff for this domain
        const existing = backoffUntil.get(domain) ?? Date.now();
        backoffUntil.set(domain, existing + 30_000);
      }
    }

    // Heartbeat
    await db
      .update(jobs)
      .set({
        pages_scraped: pagesScraped,
        pages_failed: pagesFailed,
        last_heartbeat_at: new Date(),
      })
      .where(eq(jobs.id, jobId));
  }

  await redis.del(frontierKey, visitedKey);
  return { pagesScraped, pagesFailed, changedPages };
}

// ── BullMQ Workers ────────────────────────────────────────────────────────────
const crawlWorker = new Worker<CrawlJobData>(
  'crawl',
  async (job) => {
    const {
      jobId,
      url,
      maxDepth,
      maxPages,
      includePatterns,
      excludePatterns,
      webhookUrl,
      engine,
    } = job.data;

    await db
      .update(jobs)
      .set({ status: 'running', started_at: new Date() })
      .where(eq(jobs.id, jobId));

    let status: 'completed' | 'failed' = 'completed';
    let error: string | undefined;
    let pagesScraped = 0;
    let pagesFailed = 0;

    try {
      ({ pagesScraped, pagesFailed } = await runCrawl({
        jobId,
        url,
        maxDepth,
        maxPages,
        includePatterns,
        excludePatterns,
        engine,
      }));
    } catch (err: unknown) {
      status = 'failed';
      error = errorMessage(err);
    }

    await db
      .update(jobs)
      .set({
        status,
        pages_scraped: pagesScraped,
        pages_failed: pagesFailed,
        completed_at: new Date(),
        error: error ?? null,
      })
      .where(eq(jobs.id, jobId));

    if (webhookUrl) {
      const payload = {
        'job-id': jobId,
        status,
        'pages-scraped': pagesScraped,
        'pages-failed': pagesFailed,
        'results-url': `/jobs/${jobId}`,
      };
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      }).catch(() => {
        /* best-effort */
      });
    }
  },
  { connection: bullConnection },
);

const monitorWorker = new Worker<MonitorJobData>(
  'monitor',
  async (job) => {
    const { monitorId } = job.data;

    const [monitor] = await db
      .select()
      .from(monitors)
      .where(eq(monitors.id, monitorId));
    if (!monitor || monitor.status !== 'active') return;

    // Create a synthetic job record for this monitor run
    const { randomBytes } = await import('crypto');
    const jobId = `job_${randomBytes(4).toString('hex')}`;

    await db.insert(jobs).values({
      id: jobId,
      status: 'running',
      url: monitor.url,
      max_depth: monitor.max_depth,
      max_pages: monitor.max_pages,
      include_patterns: monitor.include_patterns ?? [],
      exclude_patterns: monitor.exclude_patterns ?? [],
      started_at: new Date(),
    });

    let pagesScraped = 0;
    let changedPages: Array<{ url: string; diff: string }> = [];

    try {
      ({ pagesScraped, changedPages = [] } = await runCrawl({
        jobId,
        url: monitor.url,
        maxDepth: monitor.max_depth,
        maxPages: monitor.max_pages,
        includePatterns: monitor.include_patterns ?? [],
        excludePatterns: monitor.exclude_patterns ?? [],
        monitorId,
      }));

      await db
        .update(jobs)
        .set({ status: 'completed', completed_at: new Date() })
        .where(eq(jobs.id, jobId));
    } catch (err) {
      await db
        .update(jobs)
        .set({ status: 'failed', error: String(err), completed_at: new Date() })
        .where(eq(jobs.id, jobId));
    }

    const [check] = await db
      .insert(monitor_checks)
      .values({
        monitor_id: monitorId,
        job_id: jobId,
        pages_checked: pagesScraped,
        pages_changed: changedPages.length,
      })
      .returning();

    if (changedPages.length > 0 && check) {
      await db.insert(monitor_changes).values(
        changedPages.map((c) => ({
          check_id: check.id,
          monitor_id: monitorId,
          url: c.url,
          diff: c.diff,
        })),
      );
    }

    await db
      .update(monitors)
      .set({ last_checked_at: new Date(), last_job_id: jobId })
      .where(eq(monitors.id, monitorId));

    if (changedPages.length > 0) {
      // AI judge: if a goal is set, filter diffs through LLM before firing webhook
      type JudgedChange = {
        url: string;
        diff: string;
        relevant?: boolean;
        reason?: string;
      };
      let relevantChanges: JudgedChange[] = changedPages;

      if (monitor.goal) {
        relevantChanges = [];
        for (const change of changedPages) {
          const judgePrompt = `You are evaluating whether a webpage content change is relevant to a stated monitoring goal.

Goal: ${monitor.goal}

Content diff (lines starting with + were added, lines starting with - were removed):
${change.diff}

Reply with ONLY a valid JSON object in this exact format, no other text:
{ "relevant": true, "reason": "brief one-sentence explanation" }
or
{ "relevant": false, "reason": "brief one-sentence explanation" }`;

          try {
            const raw = await llmComplete(judgePrompt);
            const verdict = tryParseJson(raw) as {
              relevant?: boolean;
              reason?: string;
            } | null;
            if (verdict?.relevant) {
              relevantChanges.push({
                ...change,
                relevant: true,
                reason: verdict.reason,
              });
            }
          } catch {
            // Judge failed for this diff — include it to avoid silent drops
            relevantChanges.push({ ...change });
          }
        }
      }

      if (relevantChanges.length > 0) {
        const payload = {
          'monitor-id': monitorId,
          'checked-at': new Date().toISOString(),
          'pages-checked': pagesScraped,
          'pages-changed': relevantChanges.length,
          ...(monitor.goal ? { goal: monitor.goal } : {}),
          changes: relevantChanges.map((c) => ({
            url: c.url,
            diff: c.diff,
            ...(monitor.goal
              ? { relevant: c.relevant ?? true, reason: c.reason }
              : {}),
          })),
        };
        await fetch(monitor.webhook_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10_000),
        }).catch(() => {
          /* best-effort */
        });
      }
    }
  },
  { connection: bullConnection },
);

const maintenanceWorker = new Worker(
  'maintenance',
  async (job) => {
    if (job.name === 'check-orphans') {
      const staleThreshold = new Date(Date.now() - 2 * 60 * 1000);
      const stale = await db
        .select({ id: jobs.id })
        .from(jobs)
        .where(
          and(
            eq(jobs.status, 'running'),
            lt(jobs.last_heartbeat_at, staleThreshold),
          ),
        );

      for (const { id } of stale) {
        const frontierKey = `crawl:${id}:frontier`;
        const remaining = await redis.lrange(frontierKey, 0, -1);
        if (remaining.length > 0) {
          await crawlQueue.addBulk(
            remaining.map((item) => ({
              name: 'crawl',
              data: { jobId: id, ...(JSON.parse(item) as FrontierItem) },
            })),
          );
        }
        await db
          .update(jobs)
          .set({ last_heartbeat_at: new Date() })
          .where(eq(jobs.id, id));
      }
    }

    if (job.name === 'log-retention') {
      const cutoff = new Date(
        Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000,
      );
      await db.delete(logs).where(lt(logs.created_at, cutoff));
    }
  },
  { connection: bullConnection },
);

// ── Error handlers ────────────────────────────────────────────────────────────
crawlWorker.on('failed', (job, err) => {
  console.error(`[crawl] job ${job?.id} failed:`, err.message);
});

monitorWorker.on('failed', (job, err) => {
  console.error(`[monitor] job ${job?.id} failed:`, err.message);
});

maintenanceWorker.on('failed', (job, err) => {
  console.error(`[maintenance] job ${job?.id} failed:`, err.message);
});

// ── Schedule maintenance jobs on startup ─────────────────────────────────────
async function scheduleMaintenanceJobs() {
  await maintenanceQueue.add(
    'check-orphans',
    {},
    {
      repeat: { every: 60_000 },
      jobId: 'orphan-check',
    },
  );

  await maintenanceQueue.add(
    'log-retention',
    {},
    {
      repeat: { pattern: '0 3 * * *' },
      jobId: 'log-retention',
    },
  );

  console.log('[worker] fetch worker started');
}

scheduleMaintenanceJobs().catch((err) => {
  console.error('[worker] startup error:', err);
  process.exit(1);
});
