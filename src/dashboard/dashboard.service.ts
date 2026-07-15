import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db, pool } from '../db/index.js';
import { job_pages, jobs, monitors, scrape_requests } from '../db/schema.js';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const connOpts = { url: redisUrl, maxRetriesPerRequest: null as null };

const crawlQueue   = new Queue('crawl',   { connection: connOpts });
const monitorQueue = new Queue('monitor', { connection: connOpts });

@Injectable()
export class DashboardService {
  async healthStatus() {
    let db_ok = false;
    let redis_ok = false;

    try { await pool.query('SELECT 1'); db_ok = true; } catch { /* down */ }
    try { await crawlQueue.client.then((c) => (c as any).ping()); redis_ok = true; } catch { /* down */ }

    const [running] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(jobs)
      .where(eq(jobs.status, 'running'))
      .catch(() => [{ count: 0 }]);

    return { api: true, db: db_ok, redis: redis_ok, workers: running?.count ?? 0, browser: !!process.env.BROWSER_WS_ENDPOINT };
  }

  async listJobs(status?: string) {
    const rows = await db
      .select()
      .from(jobs)
      .orderBy(desc(jobs.created_at))
      .limit(100);

    if (!status || status === 'all') return rows;
    return rows.filter((j) => j.status === status);
  }

  async getJob(id: string) {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
    if (!job) return null;

    const pages = await db
      .select()
      .from(job_pages)
      .where(eq(job_pages.job_id, id))
      .orderBy(job_pages.id);

    return { job, pages };
  }

  async listMonitors() {
    return db.select().from(monitors).orderBy(desc(monitors.created_at));
  }

  async queueStats() {
    const [crawl, monitor] = await Promise.all([
      crawlQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'paused').catch(() => ({})),
      monitorQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'paused').catch(() => ({})),
    ]);
    return { crawl, monitor };
  }

  async scrapeStats() {
    const now = Date.now();
    const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
    const h24 = new Date(now - 86_400_000);

    const [totalRow, todayRow, h24Rows, avgRow, okRow, engineRows] = await Promise.all([
      db.select({ n: sql<number>`count(*)::int` }).from(scrape_requests),
      db.select({ n: sql<number>`count(*)::int` }).from(scrape_requests).where(gte(scrape_requests.created_at, midnight)),
      db.select({ n: sql<number>`count(*)::int` }).from(scrape_requests).where(gte(scrape_requests.created_at, h24)),
      db.select({ avg: sql<number>`round(avg(duration_ms))::int` }).from(scrape_requests).where(and(gte(scrape_requests.created_at, h24), eq(scrape_requests.status, 'ok'))),
      db.select({ n: sql<number>`count(*)::int` }).from(scrape_requests).where(and(gte(scrape_requests.created_at, h24), eq(scrape_requests.status, 'ok'))),
      db.select({ engine: scrape_requests.engine, n: sql<number>`count(*)::int` })
        .from(scrape_requests)
        .where(gte(scrape_requests.created_at, h24))
        .groupBy(scrape_requests.engine),
    ]);

    const total24 = h24Rows[0]?.n ?? 0;
    const ok24 = okRow[0]?.n ?? 0;
    const successRate = total24 > 0 ? Math.round((ok24 / total24) * 100) : 100;

    const engines: Record<string, number> = {};
    for (const row of engineRows) engines[row.engine ?? 'unknown'] = row.n;

    return {
      total: totalRow[0]?.n ?? 0,
      today: todayRow[0]?.n ?? 0,
      total24,
      avgMs: avgRow[0]?.avg ?? 0,
      successRate,
      engines,
    };
  }

  async listScrapes() {
    return db
      .select()
      .from(scrape_requests)
      .orderBy(desc(scrape_requests.created_at))
      .limit(200);
  }

  config() {
    return {
      LLM_PROVIDER:       process.env.LLM_PROVIDER ?? null,
      LLM_MODEL:          process.env.LLM_MODEL ?? null,
      LLM_API_KEY:        process.env.LLM_API_KEY ?? null,
      LLM_BASE_URL:       process.env.LLM_BASE_URL ?? null,
      POLITENESS_MS:      process.env.POLITENESS_MS ?? '300',
      LOG_RETENTION_DAYS: process.env.LOG_RETENTION_DAYS ?? '30',
      DATABASE_URL:       process.env.DATABASE_URL ?? null,
      REDIS_URL:          process.env.REDIS_URL ?? null,
      PORT:               process.env.PORT ?? '3000',
    };
  }
}
