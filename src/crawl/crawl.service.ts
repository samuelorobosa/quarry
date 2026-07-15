import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { randomBytes } from 'crypto';
import { db } from '../db/index.js';
import { jobs } from '../db/schema.js';
import { CrawlRequestDto } from './dto/crawl-request.dto.js';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

const crawlQueue = new Queue('crawl', { connection: { url: REDIS_URL } });

@Injectable()
export class CrawlService {
  async createCrawl(dto: CrawlRequestDto) {
    const jobId = `job_${randomBytes(4).toString('hex')}`;
    const maxDepth = dto['max-depth'] ?? 2;
    const maxPages = dto['max-pages'] ?? 100;
    const includePatterns = dto['include-patterns'] ?? [];
    const excludePatterns = dto['exclude-patterns'] ?? [];
    const webhookUrl = dto['webhook-url'] ?? null;
    const engine = dto.engine ?? 'auto';

    await db.insert(jobs).values({
      id: jobId,
      status: 'queued',
      url: dto.url,
      max_depth: maxDepth,
      max_pages: maxPages,
      include_patterns: includePatterns,
      exclude_patterns: excludePatterns,
      webhook_url: webhookUrl,
    });

    await crawlQueue.add(
      'crawl',
      {
        jobId,
        url: dto.url,
        maxDepth,
        maxPages,
        includePatterns,
        excludePatterns,
        webhookUrl,
        engine,
      },
      { jobId },
    );

    return { 'job-id': jobId, status: 'queued' };
  }
}
