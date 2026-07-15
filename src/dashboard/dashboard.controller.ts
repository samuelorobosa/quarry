import {
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  Redirect,
} from '@nestjs/common';
import { MonitorsService } from '../monitors/monitors.service.js';
import { DashboardService } from './dashboard.service.js';
import {
  configPage,
  jobDetailPage,
  jobsPage,
  layout,
  monitorsPage,
  overviewPage,
  scrapesPage,
  workersPage,
} from './templates.js';

@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly monitorsService: MonitorsService,
  ) {}

  private async shell(active: string, content: string, head?: string) {
    const status = await this.dashboardService.healthStatus();
    return layout({ title: active, active, status, content, head });
  }

  @Get()
  @Redirect('/dashboard/overview')
  root() {}

  // ── Overview ────────────────────────────────────────────────────────────────
  @Get('overview')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async overview() {
    const [stats, recentScrapes, jobRows] = await Promise.all([
      this.dashboardService.scrapeStats(),
      this.dashboardService.listScrapes(),
      this.dashboardService.listJobs(),
    ]);
    const hasRunning = jobRows.some((j) => j.status === 'running');
    const head = hasRunning ? '<meta http-equiv="refresh" content="5">' : '';
    return this.shell(
      'overview',
      overviewPage(stats, recentScrapes.slice(0, 10), jobRows),
      head,
    );
  }

  // ── Scrapes ─────────────────────────────────────────────────────────────────
  @Get('scrapes')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async scrapes(
    @Query('source') source?: string,
    @Query('engine') engine?: string,
  ) {
    const rows = await this.dashboardService.listScrapes();
    const filtered = rows.filter((r) => {
      if (source && source !== 'all' && r.source !== source) return false;
      if (engine && engine !== 'all' && r.engine !== engine) return false;
      return true;
    });
    return this.shell(
      'scrapes',
      scrapesPage(filtered, source ?? 'all', engine ?? 'all'),
    );
  }

  // ── Jobs ────────────────────────────────────────────────────────────────────
  @Get('jobs')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async jobs(@Query('status') status = 'all') {
    const rows = await this.dashboardService.listJobs(status);
    const hasRunning = rows.some((j) => j.status === 'running');
    const head = hasRunning ? '<meta http-equiv="refresh" content="10">' : '';
    return this.shell('jobs', jobsPage(rows, status), head);
  }

  @Get('jobs/:id')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async jobDetail(@Param('id') id: string) {
    const result = await this.dashboardService.getJob(id);
    if (!result)
      return this.shell(
        'jobs',
        '<main><p style="color:var(--muted);padding:32px">Job not found.</p></main>',
      );

    const job = {
      'job-id': result.job.id,
      status: result.job.status,
      url: result.job.url,
      'pages-discovered': result.job.pages_discovered,
      'pages-scraped': result.job.pages_scraped,
      'pages-failed': result.job.pages_failed,
      error: result.job.error,
    };

    const head =
      result.job.status === 'running'
        ? '<meta http-equiv="refresh" content="3">'
        : '';
    return this.shell('jobs', jobDetailPage(job, result.pages), head);
  }

  // ── Monitors ────────────────────────────────────────────────────────────────
  @Get('monitors')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async monitors() {
    const rows = await this.dashboardService.listMonitors();
    return this.shell('monitors', monitorsPage(rows));
  }

  @Post('monitors/:id/pause')
  @Redirect('/dashboard/monitors')
  async pauseMonitor(@Param('id') id: string) {
    await this.monitorsService.pauseMonitor(id).catch(() => {});
  }

  @Post('monitors/:id/resume')
  @Redirect('/dashboard/monitors')
  async resumeMonitor(@Param('id') id: string) {
    await this.monitorsService.resumeMonitor(id).catch(() => {});
  }

  @Post('monitors/:id/delete')
  @Redirect('/dashboard/monitors')
  async deleteMonitor(@Param('id') id: string) {
    await this.monitorsService.deleteMonitor(id).catch(() => {});
  }

  // ── Workers ─────────────────────────────────────────────────────────────────
  @Get('workers')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async workers() {
    const { crawl, monitor } = await this.dashboardService.queueStats();
    return this.shell('workers', workersPage(crawl, monitor));
  }

  // ── Config ──────────────────────────────────────────────────────────────────
  @Get('config')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async config() {
    const cfg = this.dashboardService.config();
    return this.shell('config', configPage(cfg));
  }
}
