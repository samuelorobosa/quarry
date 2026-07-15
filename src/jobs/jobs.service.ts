import { Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { job_pages, jobs } from '../db/schema.js';

@Injectable()
export class JobsService {
  async getJob(id: string) {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
    if (!job) throw new NotFoundException(`Job ${id} not found`);

    const pages = await db
      .select({
        url: job_pages.url,
        status: job_pages.status,
        engine: job_pages.engine,
        title: job_pages.title,
        scraped_at: job_pages.scraped_at,
      })
      .from(job_pages)
      .where(eq(job_pages.job_id, id));

    return {
      'job-id': job.id,
      status: job.status,
      url: job.url,
      'pages-discovered': job.pages_discovered,
      'pages-scraped': job.pages_scraped,
      'pages-failed': job.pages_failed,
      'started-at': job.started_at,
      'completed-at': job.completed_at,
      error: job.error ?? undefined,
      results: pages.map((p) => ({
        url: p.url,
        status: p.status,
        engine: p.engine ?? undefined,
        title: p.title ?? undefined,
        'scraped-at': p.scraped_at,
      })),
    };
  }

  async listJobs() {
    return db
      .select({
        id: jobs.id,
        status: jobs.status,
        url: jobs.url,
        pages_discovered: jobs.pages_discovered,
        pages_scraped: jobs.pages_scraped,
        pages_failed: jobs.pages_failed,
        started_at: jobs.started_at,
        completed_at: jobs.completed_at,
        created_at: jobs.created_at,
      })
      .from(jobs)
      .orderBy(jobs.created_at);
  }
}
