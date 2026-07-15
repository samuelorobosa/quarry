# Quarry

[![CI](https://github.com/samuelorobosa/quarry/actions/workflows/ci.yml/badge.svg)](https://github.com/samuelorobosa/quarry/actions/workflows/ci.yml)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)

Self-hosted web scraper and crawler built for AI agent context. Scrape pages to clean markdown, crawl entire sites, monitor for changes, and extract structured data. Runs on your own infrastructure with zero third-party dependency.

Licensed AGPL-3.0 — see [`LICENSE`](LICENSE).

---

## What it does

| Endpoint | What it does |
|---|---|
| `POST /scrape` | Single page → clean markdown |
| `POST /crawl` | Multi-page crawl, async job, webhook on completion |
| `POST /monitors` | Recurring crawl on schedule, webhook only when content changes |
| `POST /extract` | Page → structured JSON fields via LLM |
| `GET /dashboard` | Ops dashboard: jobs, monitors, queue depth, config |
| `GET /metrics` | Prometheus metrics |

---

## Architecture

See [`docs/architecture.md`](docs/architecture.md) for container and
request-flow diagrams (Mermaid) covering the scrape, crawl, monitor,
and maintenance flows.

---

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/samuelorobosa/quarry/main/install.sh | bash
```

The installer detects your OS, installs Docker if missing, clones the repo to `/opt/quarry`, generates a `.env` with random secrets, starts all services (including the Lightpanda browser worker for JS-rendered pages), and confirms the API is healthy before declaring success.

---

## Quick start (manual)

```bash
git clone https://github.com/samuelorobosa/quarry
cd quarry
cp .env.example .env   # edit .env, set POSTGRES_PASSWORD at minimum
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

---

## API

### `POST /scrape`

Fetch a single URL and return clean markdown.

```bash
curl -X POST http://localhost:3000/scrape \
  -H "Content-Type: application/json" \
  -d '{ "url": "https://example.com" }'
```

```json
{
  "url": "https://example.com",
  "title": "Example Domain",
  "markdown": "# Example Domain\n\nThis domain is for use in...",
  "scraped-at": "2026-06-20T10:00:00Z"
}
```

---

### `POST /crawl`

Start an async multi-page crawl. Returns immediately with a job ID; the crawl runs in the background.

```bash
curl -X POST http://localhost:3000/crawl \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "max-depth": 3,
    "max-pages": 100,
    "include-patterns": ["/docs/*", "/blog/*"],
    "exclude-patterns": ["/legal/*"],
    "webhook-url": "https://your-app.com/webhooks/crawl-done"
  }'
```

```json
{ "job-id": "job_8f2a1c", "status": "queued" }
```

**Check status:**

```bash
curl http://localhost:3000/jobs/job_8f2a1c
```

```json
{
  "job-id": "job_8f2a1c",
  "status": "running",
  "pages-discovered": 47,
  "pages-scraped": 12,
  "pages-failed": 0,
  "started-at": "2026-06-20T10:00:00Z",
  "results": [
    { "url": "https://example.com/docs/intro", "status": "scraped" }
  ]
}
```

Status lifecycle: `queued → running → completed | failed`

Page status values: `scraped` · `not_found` · `blocked` · `timeout` · `error`

**Webhook payload** (fired on `completed` or `failed`):

```json
{
  "job-id": "job_8f2a1c",
  "status": "completed",
  "pages-scraped": 46,
  "pages-failed": 1,
  "results-url": "/jobs/job_8f2a1c"
}
```

---

### `POST /monitors`

Save a crawl config as a recurring monitor. Re-crawls on schedule and fires a webhook only when content actually changes.

```bash
curl -X POST http://localhost:3000/monitors \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "frequency": "daily",
    "webhook-url": "https://your-app.com/webhooks/site-changed",
    "goal": "alert me when pricing changes"
  }'
```

```json
{ "monitor-id": "mon_3a9f", "status": "active" }
```

`frequency` options: `hourly` · `daily` · `weekly`

`goal` is optional. When set, each content diff is evaluated by your configured LLM. Only changes relevant to the goal fire the webhook. Without a goal, any detected change fires.

**Webhook payload:**

```json
{
  "monitor-id": "mon_3a9f",
  "checked-at": "2026-06-20T10:00:00Z",
  "pages-checked": 46,
  "pages-changed": 1,
  "goal": "alert me when pricing changes",
  "changes": [
    {
      "url": "https://example.com/pricing",
      "diff": "-Pro plan: $49/month\n+Pro plan: $59/month",
      "relevant": true,
      "reason": "Monthly price for Pro plan increased from $49 to $59"
    }
  ]
}
```

**Manage monitors:**

```bash
GET    /monitors/:id   # status, frequency, last checked, last job
DELETE /monitors/:id   # stop and remove
```

Pause and resume are available from the dashboard.

---

### `POST /extract`

Scrape a URL and extract structured fields using an LLM. Requires `LLM_PROVIDER` and `LLM_API_KEY` to be configured.

```bash
curl -X POST http://localhost:3000/extract \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/pricing",
    "schema": {
      "plan-name": "string",
      "monthly-price": "number",
      "features": "array of strings",
      "is-available": "boolean"
    }
  }'
```

```json
{
  "url": "https://example.com/pricing",
  "data": {
    "plan-name": "Pro",
    "monthly-price": 49,
    "features": ["Unlimited users", "API access", "Priority support"],
    "is-available": true
  },
  "provider": "openai",
  "model": "gpt-4o",
  "extracted-at": "2026-06-20T10:00:00Z"
}
```

Schema type hints: `"string"` · `"number"` · `"boolean"` · `"array of strings"`

Fields not found on the page return `null`. The LLM will not hallucinate values.

---

## LLM configuration

Only required for `POST /extract` and monitor `goal` filtering. Everything else works without it.

### OpenAI

```bash
LLM_PROVIDER=openai
LLM_API_KEY=sk-...
LLM_MODEL=gpt-4o
```

### Anthropic

```bash
LLM_PROVIDER=anthropic
LLM_API_KEY=sk-ant-...
LLM_MODEL=claude-sonnet-4-6
```

### Ollama (local, no API key needed)

```bash
LLM_PROVIDER=openai
LLM_BASE_URL=http://localhost:11434/v1
LLM_MODEL=llama3.2
LLM_API_KEY=ollama
```

### Any OpenAI-compatible provider (Groq, Together, Mistral, LM Studio)

```bash
LLM_PROVIDER=openai
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_API_KEY=gsk_...
LLM_MODEL=llama-3.3-70b-versatile
```

---

## Dashboard

Available at `http://localhost:3000/dashboard` once running.

| Tab | What's there |
|---|---|
| **jobs** | All crawl jobs with status, progress bars, filter by status. Auto-refreshes while jobs are running. |
| **monitors** | Active monitors, last checked time, pause / resume / delete. |
| **workers** | Queue depths for crawl and monitor queues. |
| **config** | Read-only display of all env config. Edit `.env` and restart to apply. |

---

## Self-hosting

All services run in Docker. The default stack:

| Service | Always on | Notes |
|---|---|---|
| `postgres` | ✓ | Job and monitor state |
| `redis` | ✓ | BullMQ queues, crawl frontier |
| `api` | ✓ | NestJS API, default port 3000 |
| `worker-fetch` | ✓ | Crawl engine, monitor runner |
| `lightpanda` | `--profile browser` | Lightweight headless browser (Zig/V8) |
| `worker-browser` | `--profile browser` | Playwright/Chromium fallback |

Enable browser worker:

```bash
docker compose --profile browser up -d
```

**Hardware sizing:**

| Setup | CPU | RAM |
|---|---|---|
| Dev / no browser | 2 vCPU | 4 GB |
| Production, Lightpanda | 4 vCPU | 8 GB |
| Production, Chromium used often | 4–8 vCPU | 16 GB |

---

## Configuration reference

| Variable | Default | Description |
|---|---|---|
| `POSTGRES_PASSWORD` | — | Required. Set in `.env`. |
| `DATABASE_URL` | — | Full Postgres connection string. |
| `REDIS_URL` | `redis://redis:6379` | Redis connection string. |
| `PORT` | `3000` | API port exposed to host. |
| `LLM_PROVIDER` | `openai` | `openai` or `anthropic`. |
| `LLM_API_KEY` | — | Provider API key. |
| `LLM_MODEL` | `gpt-4o` | Model for extraction and AI judge. |
| `LLM_BASE_URL` | — | Override for Ollama, Groq, etc. |
| `POLITENESS_MS` | `300` | Min delay between requests to the same domain (ms). |
| `LOG_RETENTION_DAYS` | `30` | Days to keep structured logs in Postgres. |

---

## Development

```bash
pnpm install
cp .env.example .env   # point DATABASE_URL and REDIS_URL at local instances

pnpm build             # compile TypeScript
pnpm db:migrate        # run all SQL migrations
pnpm start:dev         # API in watch mode
pnpm start:worker      # fetch + monitor worker
```

---

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for dev setup and PR
guidelines, and [`SECURITY.md`](SECURITY.md) if you're reporting a
vulnerability. This project follows the [Code of
Conduct](CODE_OF_CONDUCT.md).

---

## License

AGPL-3.0. Self-hosters can run Quarry freely. Anyone who modifies it and offers it as a network service must release their source under the same license. See [`LICENSE`](LICENSE) for the full text.
