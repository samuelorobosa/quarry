import { Controller, Get, Header } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { jobs, monitors } from '../db/schema.js';

@Controller('metrics')
export class MetricsController {
  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async metrics() {
    const jobRows = await db
      .select({ status: jobs.status, count: sql<number>`count(*)::int` })
      .from(jobs)
      .groupBy(jobs.status);

    const [monitorRow] = await db
      .select({ active: sql<number>`count(*)::int` })
      .from(monitors)
      .where(sql`status = 'active'`);

    const jobCounts: Record<string, number> = {
      queued: 0,
      running: 0,
      completed: 0,
      failed: 0,
    };
    for (const row of jobRows) {
      jobCounts[row.status] = row.count;
    }

    const totalPages = await db
      .select({
        scraped: sql<number>`coalesce(sum(pages_scraped), 0)::int`,
        failed: sql<number>`coalesce(sum(pages_failed), 0)::int`,
      })
      .from(jobs);

    const { scraped, failed } = totalPages[0] ?? { scraped: 0, failed: 0 };

    return [
      '# HELP quarry_jobs_total Crawl jobs by status',
      '# TYPE quarry_jobs_total gauge',
      ...Object.entries(jobCounts).map(
        ([s, c]) => `quarry_jobs_total{status="${s}"} ${c}`,
      ),
      '',
      '# HELP quarry_pages_scraped_total Total pages successfully scraped across all jobs',
      '# TYPE quarry_pages_scraped_total counter',
      `quarry_pages_scraped_total ${scraped}`,
      '',
      '# HELP quarry_pages_failed_total Total pages that failed across all jobs',
      '# TYPE quarry_pages_failed_total counter',
      `quarry_pages_failed_total ${failed}`,
      '',
      '# HELP quarry_monitors_active Active monitors',
      '# TYPE quarry_monitors_active gauge',
      `quarry_monitors_active ${monitorRow?.active ?? 0}`,
      '',
    ].join('\n');
  }
}
