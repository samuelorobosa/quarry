import { Controller, Get, Header, Param } from '@nestjs/common';
import { JobsService } from './jobs.service.js';

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get(':id')
  getJob(@Param('id') id: string) {
    return this.jobsService.getJob(id);
  }

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  async listJobsHtml() {
    const rows = await this.jobsService.listJobs();

    const statusBadge = (s: string) => {
      const colors: Record<string, string> = {
        queued: '#6b7280',
        running: '#2563eb',
        completed: '#16a34a',
        failed: '#dc2626',
      };
      const color = colors[s] ?? '#6b7280';
      return `<span style="background:${color};color:#fff;padding:2px 8px;border-radius:4px;font-size:12px">${s}</span>`;
    };

    const fmt = (d: Date | null) =>
      d ? new Date(d).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '—';

    const tableRows = rows
      .map(
        (j) => `
      <tr>
        <td><a href="/jobs/${j.id}">${j.id}</a></td>
        <td>${statusBadge(j.status)}</td>
        <td style="max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${j.url}</td>
        <td>${j.pages_scraped} / ${j.pages_discovered}</td>
        <td>${j.pages_failed}</td>
        <td>${fmt(j.started_at)}</td>
        <td>${fmt(j.completed_at)}</td>
      </tr>`,
      )
      .join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Quarry — Jobs</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 32px; background: #f9fafb; color: #111 }
    h1 { margin: 0 0 24px; font-size: 20px }
    table { border-collapse: collapse; width: 100%; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.08) }
    th { background: #f3f4f6; text-align: left; padding: 10px 14px; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: #6b7280 }
    td { padding: 10px 14px; border-top: 1px solid #e5e7eb; font-size: 13px; vertical-align: middle }
    tr:hover td { background: #f9fafb }
    a { color: #2563eb; text-decoration: none }
    a:hover { text-decoration: underline }
  </style>
</head>
<body>
  <h1>Quarry — Recent Jobs</h1>
  <table>
    <thead>
      <tr>
        <th>Job ID</th><th>Status</th><th>URL</th><th>Pages (scraped/discovered)</th><th>Failed</th><th>Started</th><th>Completed</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows || '<tr><td colspan="7" style="text-align:center;color:#9ca3af;padding:32px">No jobs yet</td></tr>'}
    </tbody>
  </table>
</body>
</html>`;
  }
}
