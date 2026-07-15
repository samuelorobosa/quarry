import { BadRequestException, Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import { db } from '../db/index.js';
import { scrape_requests } from '../db/schema.js';
import { browserScrape } from './browser-scrape.js';

export interface ScrapeResult {
  url: string;
  title: string;
  markdown: string;
  engine: 'fetch' | 'browser';
  'scraped-at': string;
}

const BROWSER_THRESHOLD = 150;

@Injectable()
export class ScrapeService {
  private readonly turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  });

  async scrape(
    url: string,
    engine: 'fetch' | 'browser' | 'auto' = 'auto',
    source: 'scrape' | 'extract' = 'scrape',
  ): Promise<ScrapeResult> {
    const t0 = Date.now();
    try {
      const result = await this.run(url, engine);
      void this.log({
        url, source, engine: result.engine, status: 'ok',
        duration_ms: Date.now() - t0,
        markdown_length: result.markdown.length,
        title: result.title,
      });
      return result;
    } catch (err) {
      void this.log({
        url, source,
        engine: engine === 'auto' ? undefined : engine,
        status: 'error',
        duration_ms: Date.now() - t0,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  private async run(url: string, engine: 'fetch' | 'browser' | 'auto'): Promise<ScrapeResult> {
    if (engine === 'browser') {
      return this.scrapeWithBrowser(url);
    }

    const fetched = await this.scrapeWithFetch(url);

    if (engine === 'auto' && fetched.markdown.length < BROWSER_THRESHOLD && process.env.BROWSER_WS_ENDPOINT) {
      try {
        return await this.scrapeWithBrowser(url);
      } catch { /* lightpanda not running — return fetch result */ }
    }

    return fetched;
  }

  private async scrapeWithFetch(url: string): Promise<ScrapeResult> {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { 'User-Agent': 'Quarry/0.1 (web scraper)' },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(`Failed to fetch ${url}: ${message}`);
    }

    if (!response.ok) {
      throw new BadRequestException(`${url} returned HTTP ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    $('script, style, noscript, iframe, svg').remove();

    return {
      url,
      title: $('title').text().trim(),
      markdown: this.turndown.turndown($('body').html() ?? ''),
      engine: 'fetch',
      'scraped-at': new Date().toISOString(),
    };
  }

  private async scrapeWithBrowser(url: string): Promise<ScrapeResult> {
    try {
      const { title, markdown } = await browserScrape(url);
      return { url, title, markdown, engine: 'browser', 'scraped-at': new Date().toISOString() };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(`Browser scrape failed for ${url}: ${message}`);
    }
  }

  private async log(data: {
    url: string;
    source: string;
    engine?: string;
    status: string;
    duration_ms: number;
    markdown_length?: number;
    title?: string;
    error?: string;
  }) {
    await db.insert(scrape_requests).values(data).catch(() => {});
  }
}
