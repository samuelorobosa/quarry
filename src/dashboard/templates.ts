import type {
  jobs,
  job_pages,
  monitors,
  scrape_requests,
} from '../db/schema.js';

type Job = typeof jobs.$inferSelect;
type JobPage = typeof job_pages.$inferSelect;
type Monitor = typeof monitors.$inferSelect;
type ScrapeRequest = typeof scrape_requests.$inferSelect;

interface ScrapeStats {
  total: number;
  today: number;
  total24: number;
  avgMs: number | null;
  successRate: number;
  engines: Record<string, number>;
}

interface JobSummary {
  'job-id': string;
  status: string;
  url: string;
  'pages-discovered': number;
  'pages-scraped': number;
  'pages-failed': number;
  error: string | null;
}

type QueueCounts = Record<string, number>;

// ── Shared styles ─────────────────────────────────────────────────────────────
function css(): string {
  return `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg:           #080810;
      --surface:      #0f0f1a;
      --surface-2:    #13131f;
      --hover:        #1a1a28;
      --border:       rgba(255,255,255,0.07);
      --border-hi:    rgba(99,102,241,0.3);
      --text:         #e2e8f0;
      --muted:        #64748b;
      --dim:          #2d3748;
      --green:        #4ade80;
      --green-bg:     rgba(74,222,128,0.1);
      --red:          #f87171;
      --red-bg:       rgba(248,113,113,0.1);
      --blue:         #60a5fa;
      --blue-bg:      rgba(96,165,250,0.1);
      --yellow:       #fbbf24;
      --yellow-bg:    rgba(251,191,36,0.1);
      --cyan:         #22d3ee;
      --purple:       #c084fc;
    }

    html { scroll-behavior: smooth; }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'SF Mono', ui-monospace, monospace;
      font-size: 13px;
      line-height: 1.6;
      min-height: 100vh;
    }

    /* ── Header ── */
    header {
      position: sticky; top: 0; z-index: 50;
      display: flex; align-items: center; gap: 32px;
      padding: 0 32px; height: 52px;
      background: rgba(8,8,16,0.92);
      backdrop-filter: blur(16px);
      border-bottom: 1px solid var(--border);
    }

    .logo {
      color: var(--cyan);
      font-size: 14px; font-weight: 700;
      text-decoration: none; letter-spacing: -0.03em;
      display: flex; align-items: center; gap: 8px;
    }

    .logo-icon { color: var(--purple); }

    nav { display: flex; gap: 2px; }

    nav a {
      color: var(--muted);
      text-decoration: none;
      padding: 5px 12px;
      border-radius: 5px;
      font-size: 12px;
      transition: color 0.15s, background 0.15s;
    }

    nav a:hover { color: var(--text); background: var(--hover); }

    nav a.active {
      color: var(--text);
      background: var(--hover);
      border: 1px solid var(--border-hi);
    }

    .header-right { margin-left: auto; display: flex; align-items: center; gap: 16px; }

    /* ── Status strip ── */
    .status-strip {
      display: flex; align-items: center; gap: 24px;
      padding: 7px 32px;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      font-size: 11px; color: var(--muted);
      overflow-x: auto;
    }

    .si { display: flex; align-items: center; gap: 6px; white-space: nowrap; }

    .dot {
      width: 6px; height: 6px;
      border-radius: 50%; flex-shrink: 0;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0.25; }
    }

    .dot-green  { background: var(--green);  animation: pulse 2s ease-in-out infinite; }
    .dot-red    { background: var(--red); }
    .dot-yellow { background: var(--yellow); animation: pulse 1s ease-in-out infinite; }
    .dot-blue   { background: var(--blue);   animation: pulse 1.5s ease-in-out infinite; }
    .dot-gray   { background: var(--muted); }

    /* ── Layout ── */
    main { padding: 32px; max-width: 1280px; margin: 0 auto; }

    .page-header {
      display: flex; align-items: baseline; gap: 12px;
      margin-bottom: 24px;
    }

    .page-title {
      font-size: 14px; font-weight: 700; color: var(--text);
      letter-spacing: -0.02em;
    }

    .page-sub { font-size: 11px; color: var(--muted); }

    .back {
      font-size: 11px; color: var(--muted);
      text-decoration: none; margin-bottom: 20px;
      display: inline-flex; align-items: center; gap: 6px;
      transition: color 0.15s;
    }
    .back:hover { color: var(--text); }

    section { margin-bottom: 36px; }

    .section-label {
      font-size: 10px; font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.1em;
      color: var(--muted); margin-bottom: 12px;
      display: flex; align-items: center; gap: 8px;
    }

    .section-label::after {
      content: ''; flex: 1;
      height: 1px; background: var(--border);
    }

    /* ── Stat cards ── */
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 32px; }

    @media (max-width: 900px) { .stats { grid-template-columns: repeat(2, 1fr); } }

    .stat {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px; padding: 20px 24px;
      transition: border-color 0.15s;
    }

    .stat:hover { border-color: var(--border-hi); }

    .stat-label {
      font-size: 10px; text-transform: uppercase;
      letter-spacing: 0.1em; color: var(--muted); margin-bottom: 10px;
    }

    .stat-value {
      font-size: 32px; font-weight: 700;
      color: var(--text); letter-spacing: -0.04em; line-height: 1;
    }

    .stat-value.green { color: var(--green); }
    .stat-value.blue  { color: var(--blue); }
    .stat-value.red   { color: var(--red); }

    .stat-sub { font-size: 11px; color: var(--dim); margin-top: 6px; }

    /* ── Tables ── */
    .table-wrap {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px; overflow: hidden;
    }

    table { width: 100%; border-collapse: collapse; }

    th {
      text-align: left; padding: 10px 16px;
      font-size: 10px; font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.09em;
      color: var(--dim);
      background: rgba(255,255,255,0.02);
      border-bottom: 1px solid var(--border);
    }

    td {
      padding: 10px 16px;
      border-bottom: 1px solid var(--border);
      font-size: 12px; vertical-align: middle;
    }

    tr:last-child td { border-bottom: none; }
    tbody tr:hover td { background: var(--hover); }

    .cell-url {
      max-width: 260px; overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap;
      color: var(--muted);
    }

    .cell-id { color: var(--cyan); font-size: 11px; }

    /* ── Badges ── */
    .badge {
      display: inline-block;
      padding: 2px 8px; border-radius: 3px;
      font-size: 10px; font-weight: 600;
      letter-spacing: 0.04em;
    }

    .badge-queued   { background: rgba(100,116,139,0.15); color: #94a3b8; }
    .badge-running  { background: var(--blue-bg);   color: var(--blue); }
    .badge-completed{ background: var(--green-bg);  color: var(--green); }
    .badge-failed   { background: var(--red-bg);    color: var(--red); }
    .badge-active   { background: var(--green-bg);  color: var(--green); }
    .badge-paused   { background: var(--yellow-bg); color: var(--yellow); }
    .badge-deleted  { background: rgba(100,116,139,0.15); color: #94a3b8; }
    .badge-scraped  { background: var(--green-bg);  color: var(--green); }
    .badge-not_found{ background: rgba(100,116,139,0.15); color: #94a3b8; }
    .badge-blocked  { background: var(--yellow-bg); color: var(--yellow); }
    .badge-timeout  { background: var(--yellow-bg); color: var(--yellow); }
    .badge-error    { background: var(--red-bg);    color: var(--red); }

    /* ── Buttons ── */
    .btn {
      display: inline-flex; align-items: center;
      padding: 4px 10px; border-radius: 4px;
      font-family: inherit; font-size: 11px;
      cursor: pointer; border: 1px solid var(--border);
      background: transparent; color: var(--muted);
      text-decoration: none; transition: all 0.15s;
      white-space: nowrap;
    }

    .btn:hover { color: var(--text); border-color: rgba(255,255,255,0.15); background: var(--hover); }
    .btn-danger:hover  { color: var(--red);   border-color: var(--red);   background: var(--red-bg); }
    .btn-success:hover { color: var(--green); border-color: var(--green); background: var(--green-bg); }
    .btn-primary:hover { color: var(--cyan);  border-color: var(--cyan);  background: rgba(34,211,238,0.1); }

    .actions { display: flex; gap: 6px; }

    form { display: inline; }

    /* ── Filter tabs ── */
    .filters {
      display: flex; gap: 4px; margin-bottom: 16px;
    }

    .filter {
      padding: 5px 12px; border-radius: 5px;
      font-size: 11px; color: var(--muted);
      text-decoration: none; border: 1px solid transparent;
      transition: all 0.15s;
    }

    .filter:hover { color: var(--text); background: var(--hover); }

    .filter.active {
      color: var(--text); background: var(--hover);
      border-color: var(--border-hi);
    }

    /* ── Config ── */
    .config-block {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px; overflow: hidden;
      margin-bottom: 16px;
    }

    .config-row {
      display: grid; grid-template-columns: 220px 1fr;
      padding: 10px 20px; border-bottom: 1px solid var(--border);
      align-items: center; gap: 16px;
    }

    .config-row:last-child { border-bottom: none; }
    .config-row:hover { background: var(--hover); }

    .config-key  { font-size: 11px; color: var(--cyan); }
    .config-val  { font-size: 11px; color: var(--green); }
    .config-null { font-size: 11px; color: var(--dim); font-style: italic; }
    .config-mask { font-size: 11px; color: var(--muted); letter-spacing: 0.1em; }

    /* ── Queue cards ── */
    .queues { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

    .queue-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px; padding: 20px;
    }

    .queue-name {
      font-size: 12px; font-weight: 600; color: var(--text);
      margin-bottom: 16px; display: flex; align-items: center; gap: 8px;
    }

    .queue-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }

    .qs { }
    .qs-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); }
    .qs-value { font-size: 22px; font-weight: 700; color: var(--text); letter-spacing: -0.03em; }
    .qs-value.active { color: var(--blue); }
    .qs-value.failed { color: var(--red); }

    /* ── Empty state ── */
    .empty {
      text-align: center; padding: 64px 32px;
      color: var(--muted); font-size: 12px;
    }

    .empty-icon { font-size: 24px; margin-bottom: 12px; opacity: 0.4; }

    /* ── Progress bar ── */
    .progress-wrap { width: 80px; height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; }
    .progress-bar  { height: 100%; background: var(--blue); border-radius: 2px; transition: width 0.3s; }

    a { color: var(--cyan); text-decoration: none; }
    a:hover { text-decoration: underline; }
  `;
}

// ── Shared layout ─────────────────────────────────────────────────────────────
export function layout(opts: {
  title: string;
  active: string;
  status: {
    api: boolean;
    db: boolean;
    redis: boolean;
    workers: number;
    browser: boolean;
  };
  content: string;
  head?: string;
}): string {
  const { title, active, status, content, head = '' } = opts;
  const nav = ['overview', 'scrapes', 'jobs', 'monitors', 'workers', 'config'];

  const workerDot = status.workers > 0 ? 'dot-blue' : 'dot-gray';
  const workerLabel = status.workers > 0 ? `${status.workers} active` : 'idle';
  const browserConfigured = status.browser;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>quarry · ${title}</title>
  <style>${css()}</style>
  ${head}
</head>
<body>
<header>
  <a class="logo" href="/dashboard">
    <span class="logo-icon">▸</span>quarry
  </a>
  <nav>
    ${nav.map((n) => `<a href="/dashboard/${n}"${n === active ? ' class="active"' : ''}>${n}</a>`).join('')}
  </nav>
</header>

<div class="status-strip">
  <div class="si"><span class="dot ${status.api ? 'dot-green' : 'dot-red'}"></span>api.${status.api ? 'healthy' : 'degraded'}</div>
  <div class="si"><span class="dot ${status.db ? 'dot-green' : 'dot-red'}"></span>postgres.${status.db ? 'connected' : 'unreachable'}</div>
  <div class="si"><span class="dot ${status.redis ? 'dot-green' : 'dot-red'}"></span>redis.${status.redis ? 'connected' : 'unreachable'}</div>
  <div class="si"><span class="dot ${workerDot}"></span>worker.${workerLabel}</div>
  <div class="si"><span class="dot ${browserConfigured ? 'dot-green' : 'dot-gray'}"></span>browser.${browserConfigured ? 'enabled' : 'disabled'}</div>
</div>

<main>${content}</main>
</body>
</html>`;
}

// ── Overview ──────────────────────────────────────────────────────────────────
export function overviewPage(
  stats: ScrapeStats,
  recentScrapes: ScrapeRequest[],
  recentJobs: Job[],
): string {
  const fmt = (d: Date | null) =>
    d ? new Date(d).toISOString().slice(0, 19).replace('T', ' ') : '—';
  const dur = (ms: number | null) =>
    ms == null ? '—' : ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
  const runningJobs = recentJobs.filter((j) => j.status === 'running');

  const engineFetch = stats.engines?.fetch ?? 0;
  const engineBrowser = stats.engines?.browser ?? 0;
  const engineTotal = engineFetch + engineBrowser;
  const browserPct =
    engineTotal > 0 ? Math.round((engineBrowser / engineTotal) * 100) : 0;

  const scrapeRows = recentScrapes
    .map(
      (r) => `
    <tr>
      <td><div class="cell-url" title="${r.url}">${r.url}</div></td>
      <td><span class="badge badge-${r.source === 'extract' ? 'blue' : 'queued'}">${r.source}</span></td>
      <td><span class="badge badge-${r.engine === 'browser' ? 'running' : 'queued'}">${r.engine ?? '—'}</span></td>
      <td style="color:var(--muted);font-size:11px">${dur(r.duration_ms)}</td>
      <td><span class="badge badge-${r.status === 'ok' ? 'completed' : 'failed'}">${r.status}</span></td>
      <td style="color:var(--muted);font-size:11px">${fmt(r.created_at)}</td>
    </tr>`,
    )
    .join('');

  const jobRows = recentJobs
    .slice(0, 8)
    .map((j) => {
      const pct =
        j.pages_discovered > 0
          ? Math.round((j.pages_scraped / j.pages_discovered) * 100)
          : 0;
      return `
    <tr>
      <td><a class="cell-id" href="/dashboard/jobs/${j.id}">${j.id}</a></td>
      <td><span class="badge badge-${j.status}">${j.status}</span></td>
      <td><div class="cell-url">${j.url}</div></td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="progress-wrap"><div class="progress-bar" style="width:${pct}%;background:${j.status === 'running' ? 'var(--blue)' : 'var(--green)'}"></div></div>
          <span style="font-size:11px;color:var(--muted)">${j.pages_scraped}/${j.pages_discovered}</span>
        </div>
      </td>
      <td style="color:var(--muted);font-size:11px">${fmt(j.created_at)}</td>
    </tr>`;
    })
    .join('');

  return `
    <div class="page-header">
      <span class="page-title">overview</span>
      <span class="page-sub">last 24 hours</span>
    </div>

    <div class="stats">
      <div class="stat">
        <div class="stat-label">scrapes today</div>
        <div class="stat-value blue">${stats.today}</div>
        <div class="stat-sub">${stats.total} all time</div>
      </div>
      <div class="stat">
        <div class="stat-label">success rate (24h)</div>
        <div class="stat-value ${stats.successRate >= 90 ? 'green' : stats.successRate >= 70 ? '' : 'red'}">${stats.successRate}%</div>
        <div class="stat-sub">${stats.total24} requests</div>
      </div>
      <div class="stat">
        <div class="stat-label">avg response time (24h)</div>
        <div class="stat-value">${dur(stats.avgMs)}</div>
        <div class="stat-sub">successful scrapes only</div>
      </div>
      <div class="stat">
        <div class="stat-label">browser engine (24h)</div>
        <div class="stat-value ${browserPct > 0 ? 'blue' : ''}">${browserPct}%</div>
        <div class="stat-sub">${engineBrowser} browser · ${engineFetch} fetch</div>
      </div>
    </div>

    <section>
      <div class="section-label">recent scrapes <a href="/dashboard/scrapes" style="font-size:10px;margin-left:auto;text-transform:none;letter-spacing:0">view all →</a></div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>url</th><th>source</th><th>engine</th><th>duration</th><th>status</th><th>time</th></tr>
          </thead>
          <tbody>
            ${scrapeRows || '<tr><td colspan="6"><div class="empty"><div class="empty-icon">○</div>no scrapes yet — try <span style="color:var(--cyan)">POST /scrape</span></div></td></tr>'}
          </tbody>
        </table>
      </div>
    </section>

    ${
      runningJobs.length > 0
        ? `
    <section>
      <div class="section-label">
        <span class="dot dot-blue" style="display:inline-block"></span>
        live crawls
      </div>
      ${runningJobs
        .map((j) => {
          const pct =
            j.pages_discovered > 0
              ? Math.round((j.pages_scraped / j.pages_discovered) * 100)
              : 0;
          return `
        <div style="background:var(--surface);border:1px solid var(--border-hi);border-radius:8px;padding:16px 20px;margin-bottom:10px;display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center">
          <div>
            <div style="font-size:11px;color:var(--cyan);margin-bottom:4px"><a href="/dashboard/jobs/${j.id}">${j.id}</a></div>
            <div style="font-size:11px;color:var(--muted);margin-bottom:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${j.url}</div>
            <div style="display:flex;align-items:center;gap:10px">
              <div class="progress-wrap" style="width:160px"><div class="progress-bar" style="width:${pct}%;background:var(--blue)"></div></div>
              <span style="font-size:11px;color:var(--blue)">${j.pages_scraped}/${j.pages_discovered} pages</span>
              ${j.pages_failed > 0 ? `<span style="font-size:11px;color:var(--red)">${j.pages_failed} failed</span>` : ''}
            </div>
          </div>
          <a href="/dashboard/jobs/${j.id}" class="btn btn-primary">view log →</a>
        </div>`;
        })
        .join('')}
    </section>`
        : ''
    }

    <section>
      <div class="section-label">recent crawl jobs <a href="/dashboard/jobs" style="font-size:10px;margin-left:auto;text-transform:none;letter-spacing:0">view all →</a></div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>job id</th><th>status</th><th>url</th><th>progress</th><th>started</th></tr>
          </thead>
          <tbody>
            ${jobRows || '<tr><td colspan="5"><div class="empty"><div class="empty-icon">○</div>no jobs yet — try <span style="color:var(--cyan)">POST /crawl</span></div></td></tr>'}
          </tbody>
        </table>
      </div>
    </section>`;
}

// ── Scrapes list ──────────────────────────────────────────────────────────────
export function scrapesPage(
  rows: ScrapeRequest[],
  sourceFilter: string,
  engineFilter: string,
): string {
  const fmt = (d: Date | null) =>
    d ? new Date(d).toISOString().slice(0, 19).replace('T', ' ') : '—';
  const dur = (ms: number | null) =>
    ms == null ? '—' : ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;

  const tableRows = rows
    .map(
      (r) => `
    <tr>
      <td><div class="cell-url" title="${r.url}">${r.url}</div></td>
      <td><span class="badge badge-${r.source === 'extract' ? 'blue' : 'queued'}">${r.source}</span></td>
      <td><span class="badge badge-${r.engine === 'browser' ? 'running' : 'queued'}">${r.engine ?? '—'}</span></td>
      <td style="color:var(--muted);font-size:11px">${dur(r.duration_ms)}</td>
      <td style="color:var(--muted);font-size:11px">${r.markdown_length != null ? r.markdown_length.toLocaleString() : '—'}</td>
      <td><span class="badge badge-${r.status === 'ok' ? 'completed' : 'failed'}">${r.status}</span></td>
      <td style="color:var(--muted);font-size:11px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.error ?? ''}">${r.error ?? '—'}</td>
      <td style="color:var(--muted);font-size:11px">${fmt(r.created_at)}</td>
    </tr>`,
    )
    .join('');

  const sourceFilters = [
    { v: 'all', label: 'all' },
    { v: 'scrape', label: 'scrape' },
    { v: 'extract', label: 'extract' },
  ];
  const engineFilters = [
    { v: 'all', label: 'all engines' },
    { v: 'fetch', label: 'fetch' },
    { v: 'browser', label: 'browser' },
  ];

  const filterLink = (s: string, e: string, label: string, active: boolean) =>
    `<a href="/dashboard/scrapes?source=${s}&engine=${e}" class="filter${active ? ' active' : ''}">${label}</a>`;

  return `
    <div class="page-header">
      <span class="page-title">scrapes</span>
      <span class="page-sub">${rows.length} result${rows.length !== 1 ? 's' : ''}</span>
    </div>

    <div style="display:flex;gap:16px;align-items:center;margin-bottom:16px;flex-wrap:wrap">
      <div class="filters" style="margin-bottom:0">
        ${sourceFilters.map((f) => filterLink(f.v, engineFilter, f.v, f.v === sourceFilter)).join('')}
      </div>
      <div class="filters" style="margin-bottom:0">
        ${engineFilters.map((f) => filterLink(sourceFilter, f.v, f.label, f.v === engineFilter)).join('')}
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>url</th><th>source</th><th>engine</th><th>duration</th>
            <th>chars</th><th>status</th><th>error</th><th>time</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows || '<tr><td colspan="8"><div class="empty"><div class="empty-icon">○</div>no scrapes yet</div></td></tr>'}
        </tbody>
      </table>
    </div>`;
}

// ── Jobs list ─────────────────────────────────────────────────────────────────
export function jobsPage(jobList: Job[], filter: string): string {
  const filters = ['all', 'queued', 'running', 'completed', 'failed'];
  const fmt = (d: Date | null) =>
    d ? new Date(d).toISOString().slice(0, 19).replace('T', ' ') : '—';
  const pct = (j: Job) =>
    j.pages_discovered > 0
      ? Math.round((j.pages_scraped / j.pages_discovered) * 100)
      : 0;

  const rows = jobList
    .map(
      (j) => `
    <tr>
      <td><a class="cell-id" href="/dashboard/jobs/${j.id}">${j.id}</a></td>
      <td><span class="badge badge-${j.status}">${j.status}</span></td>
      <td><div class="cell-url">${j.url}</div></td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="progress-wrap"><div class="progress-bar" style="width:${pct(j)}%"></div></div>
          <span style="font-size:11px;color:var(--muted)">${j.pages_scraped}/${j.pages_discovered}</span>
        </div>
      </td>
      <td style="color:${j.pages_failed > 0 ? 'var(--red)' : 'var(--dim)'}">${j.pages_failed}</td>
      <td style="color:var(--muted);font-size:11px">${fmt(j.started_at)}</td>
    </tr>`,
    )
    .join('');

  return `
    <div class="page-header">
      <span class="page-title">jobs</span>
      <span class="page-sub">${jobList.length} result${jobList.length !== 1 ? 's' : ''}</span>
    </div>

    <div class="filters">
      ${filters.map((f) => `<a href="/dashboard/jobs?status=${f}" class="filter${f === filter ? ' active' : ''}">${f}</a>`).join('')}
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>job id</th><th>status</th><th>url</th>
            <th>progress</th><th>failed</th><th>started</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="6"><div class="empty"><div class="empty-icon">○</div>no jobs yet</div></td></tr>'}
        </tbody>
      </table>
    </div>`;
}

// ── Job detail ────────────────────────────────────────────────────────────────
export function jobDetailPage(job: JobSummary, pages: JobPage[]): string {
  const fmt = (d: Date | null) =>
    d ? new Date(d).toISOString().slice(0, 19).replace('T', ' ') : '—';
  const dur = (ms: number | null) =>
    ms == null ? '—' : ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
  const chars = (n: number | null) =>
    n == null ? '—' : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

  const isRunning = job.status === 'running';
  const pct =
    job['pages-discovered'] > 0
      ? Math.round((job['pages-scraped'] / job['pages-discovered']) * 100)
      : 0;

  const rows = pages
    .map((p, i) => {
      const isNew = isRunning && i >= pages.length - 3;
      return `
    <tr${isNew ? ' style="background:rgba(96,165,250,0.04)"' : ''}>
      <td style="color:var(--dim);font-size:10px;width:32px;text-align:right;padding-right:8px">${i + 1}</td>
      <td><span class="badge badge-${p.status}">${p.status}</span></td>
      <td><span class="badge badge-${p.engine === 'browser' ? 'running' : 'queued'}" style="font-size:9px">${p.engine ?? '—'}</span></td>
      <td style="color:var(--muted);font-size:11px">${dur(p.duration_ms)}</td>
      <td style="color:var(--muted);font-size:11px">${chars(p.markdown_length)}</td>
      <td style="max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px" title="${p.url}"><a href="${p.url}" target="_blank" style="color:var(--cyan)">${p.url}</a></td>
      <td style="color:var(--muted);font-size:11px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${p.title ?? ''}">${p.title ?? p.error ?? '—'}</td>
      <td style="color:var(--dim);font-size:10px;white-space:nowrap">${fmt(p.scraped_at)}</td>
    </tr>`;
    })
    .join('');

  const timedPages = pages.filter((p) => p.duration_ms != null);
  const avgDuration =
    timedPages.length > 0
      ? Math.round(
          timedPages.reduce((s, p) => s + p.duration_ms, 0) / timedPages.length,
        )
      : null;

  return `
    <a class="back" href="/dashboard/jobs">← jobs</a>

    <div class="page-header" style="margin-top:12px">
      <span class="page-title">${job['job-id']}</span>
      <span class="badge badge-${job.status}">${job.status}</span>
      ${isRunning ? '<span style="font-size:11px;color:var(--blue);animation:pulse 1s ease-in-out infinite">● live</span>' : ''}
    </div>

    <div class="stats" style="grid-template-columns:repeat(4,1fr);margin-bottom:24px">
      <div class="stat">
        <div class="stat-label">scraped</div>
        <div class="stat-value green">${job['pages-scraped']}</div>
        <div class="stat-sub">of ${job['pages-discovered']} discovered</div>
      </div>
      <div class="stat">
        <div class="stat-label">failed</div>
        <div class="stat-value ${job['pages-failed'] > 0 ? 'red' : ''}">${job['pages-failed']}</div>
      </div>
      <div class="stat">
        <div class="stat-label">avg duration</div>
        <div class="stat-value" style="font-size:22px">${dur(avgDuration)}</div>
        <div class="stat-sub">per page</div>
      </div>
      <div class="stat">
        <div class="stat-label">progress</div>
        <div class="stat-value" style="font-size:22px">${pct}%</div>
        <div style="margin-top:8px"><div class="progress-wrap" style="width:100%"><div class="progress-bar" style="width:${pct}%;background:${isRunning ? 'var(--blue)' : 'var(--green)'}"></div></div></div>
      </div>
    </div>

    <div style="font-size:11px;color:var(--muted);margin-bottom:12px;word-break:break-all">
      <span style="color:var(--dim)">url</span> &nbsp;${job.url}
    </div>

    ${job.error ? `<div style="background:var(--red-bg);border:1px solid var(--red);border-radius:6px;padding:12px 16px;font-size:11px;color:var(--red);margin-bottom:24px">${job.error}</div>` : ''}

    <section>
      <div class="section-label">
        page log
        <span style="color:var(--dim);font-size:10px;font-weight:400;letter-spacing:0;text-transform:none">${pages.length} entries${isRunning ? ' · refreshing every 3s' : ''}</span>
      </div>
      <div class="table-wrap" style="max-height:600px;overflow-y:auto" id="log-wrap">
        <table>
          <thead>
            <tr><th>#</th><th>status</th><th>engine</th><th>duration</th><th>chars</th><th>url</th><th>title / error</th><th>time</th></tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="8"><div class="empty">waiting for first page…</div></td></tr>'}
          </tbody>
        </table>
      </div>
    </section>

    ${
      isRunning
        ? `<script>
      const wrap = document.getElementById('log-wrap');
      if (wrap) wrap.scrollTop = wrap.scrollHeight;
    </script>`
        : ''
    }`;
}

// ── Monitors ──────────────────────────────────────────────────────────────────
export function monitorsPage(monitorList: Monitor[]): string {
  const fmt = (d: Date | null) =>
    d ? new Date(d).toISOString().slice(0, 19).replace('T', ' ') : '—';

  const rows = monitorList
    .map(
      (m) => `
    <tr>
      <td><span class="cell-id">${m.id}</span></td>
      <td><span class="badge badge-${m.status}">${m.status}</span></td>
      <td><div class="cell-url" title="${m.url}">${m.url}</div></td>
      <td style="color:var(--muted);font-size:11px">${m.frequency}</td>
      <td style="font-size:11px;color:var(--muted);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${m.goal ?? ''}">${m.goal ?? '—'}</td>
      <td style="color:var(--muted);font-size:11px">${fmt(m.last_checked_at)}</td>
      <td>
        <div class="actions">
          ${
            m.status === 'active'
              ? `
            <form method="POST" action="/dashboard/monitors/${m.id}/pause">
              <button class="btn btn-danger" type="submit">pause</button>
            </form>`
              : ''
          }
          ${
            m.status === 'paused'
              ? `
            <form method="POST" action="/dashboard/monitors/${m.id}/resume">
              <button class="btn btn-success" type="submit">resume</button>
            </form>`
              : ''
          }
          ${m.last_job_id ? `<a class="btn" href="/dashboard/jobs/${m.last_job_id}">last run</a>` : ''}
          <form method="POST" action="/dashboard/monitors/${m.id}/delete" onsubmit="return confirm('Delete monitor ${m.id}?')">
            <button class="btn btn-danger" type="submit">delete</button>
          </form>
        </div>
      </td>
    </tr>`,
    )
    .join('');

  return `
    <div class="page-header">
      <span class="page-title">monitors</span>
      <span class="page-sub">${monitorList.length} total</span>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>id</th><th>status</th><th>url</th>
            <th>frequency</th><th>goal</th><th>last checked</th><th>actions</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="7"><div class="empty"><div class="empty-icon">○</div>no monitors yet — create one via <span style="color:var(--cyan)">POST /monitors</span></div></td></tr>'}
        </tbody>
      </table>
    </div>`;
}

// ── Workers ───────────────────────────────────────────────────────────────────
export function workersPage(crawl: QueueCounts, monitor: QueueCounts): string {
  const qCard = (name: string, counts: QueueCounts) => `
    <div class="queue-card">
      <div class="queue-name">
        <span class="dot ${counts.active > 0 ? 'dot-blue' : 'dot-gray'}"></span>
        ${name} queue
      </div>
      <div class="queue-stats">
        <div class="qs">
          <div class="qs-label">waiting</div>
          <div class="qs-value">${counts.waiting ?? 0}</div>
        </div>
        <div class="qs">
          <div class="qs-label">active</div>
          <div class="qs-value active">${counts.active ?? 0}</div>
        </div>
        <div class="qs">
          <div class="qs-label">completed</div>
          <div class="qs-value">${counts.completed ?? 0}</div>
        </div>
        <div class="qs">
          <div class="qs-label">failed</div>
          <div class="qs-value failed">${counts.failed ?? 0}</div>
        </div>
        <div class="qs">
          <div class="qs-label">delayed</div>
          <div class="qs-value">${counts.delayed ?? 0}</div>
        </div>
        <div class="qs">
          <div class="qs-label">paused</div>
          <div class="qs-value">${counts.paused ?? 0}</div>
        </div>
      </div>
    </div>`;

  return `
    <div class="page-header">
      <span class="page-title">workers</span>
      <span class="page-sub">queue depth &amp; health</span>
    </div>

    <section>
      <div class="section-label">queues</div>
      <div class="queues">
        ${qCard('crawl', crawl)}
        ${qCard('monitor', monitor)}
      </div>
    </section>`;
}

// ── Config ────────────────────────────────────────────────────────────────────
export function configPage(cfg: Record<string, string | null>): string {
  const row = (key: string, val: string | null, mask = false) => {
    let display: string;
    if (val === null || val === '') {
      display = `<span class="config-null">not set</span>`;
    } else if (mask) {
      display = `<span class="config-mask">${val.slice(0, 6)}${'•'.repeat(12)}</span>`;
    } else {
      display = `<span class="config-val">${val}</span>`;
    }
    return `<div class="config-row"><span class="config-key">${key}</span>${display}</div>`;
  };

  return `
    <div class="page-header">
      <span class="page-title">config</span>
      <span class="page-sub">read-only · edit .env and restart to apply</span>
    </div>

    <section>
      <div class="section-label">llm provider</div>
      <div class="config-block">
        ${row('LLM_PROVIDER', cfg.LLM_PROVIDER)}
        ${row('LLM_MODEL', cfg.LLM_MODEL)}
        ${row('LLM_API_KEY', cfg.LLM_API_KEY, true)}
        ${row('LLM_BASE_URL', cfg.LLM_BASE_URL ?? null)}
      </div>
    </section>

    <section>
      <div class="section-label">crawler</div>
      <div class="config-block">
        ${row('POLITENESS_MS', cfg.POLITENESS_MS)}
        ${row('LOG_RETENTION_DAYS', cfg.LOG_RETENTION_DAYS)}
      </div>
    </section>

    <section>
      <div class="section-label">infrastructure</div>
      <div class="config-block">
        ${row('DATABASE_URL', cfg.DATABASE_URL ? cfg.DATABASE_URL.replace(/:([^:@]+)@/, ':••••@') : null)}
        ${row('REDIS_URL', cfg.REDIS_URL)}
        ${row('PORT', cfg.PORT)}
      </div>
    </section>

    <p style="font-size:11px;color:var(--muted);margin-top:8px">
      restart required after any change: <span style="color:var(--cyan)">docker compose restart api worker-fetch</span>
    </p>`;
}
