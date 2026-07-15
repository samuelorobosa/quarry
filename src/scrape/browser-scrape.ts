import { chromium } from 'playwright-core';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });

export interface BrowserScrapeResult {
  title: string;
  markdown: string;
  links: string[];
}

export async function browserScrape(url: string): Promise<BrowserScrapeResult> {
  const wsEndpoint = process.env.BROWSER_WS_ENDPOINT;

  const browser = wsEndpoint
    ? await chromium.connectOverCDP(wsEndpoint)
    : await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });

  try {
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ 'User-Agent': 'Quarry/0.1 (web scraper)' });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });

    const html = await page.content();
    const title = await page.title();

    const $ = cheerio.load(html);
    $('script, style, noscript, iframe, svg').remove();

    const links: string[] = [];
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (href) links.push(href);
    });

    const markdown = turndown.turndown($('body').html() ?? '');
    return { title, markdown, links };
  } finally {
    await browser.close();
  }
}
