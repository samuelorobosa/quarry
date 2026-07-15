# Quarry — Architecture

This is a descriptive snapshot of how the system fits together today,
derived from the current code (`src/`, `docker-compose.yml`,
`migrations/0001-init.sql`), not a design proposal. See `AGENTS.md` for
the stack decisions behind these choices and `ROADMAP.md` for phase
status.

## Container view

```mermaid
flowchart TB
    subgraph client["External caller"]
        C[HTTP client]
    end

    subgraph quarry["Quarry: quarry-net bridge network"]
        API["api<br/>NestJS, Express adapter<br/>crawl / scrape / extract /<br/>jobs / monitors / metrics / dashboard"]
        WF["worker-fetch<br/>plain Node/TS<br/>BullMQ workers: crawl, monitor, maintenance"]
        WB["worker-browser<br/>same image as worker-fetch<br/>profile: browser"]
        LP["lightpanda<br/>headless engine, Zig/V8, CDP<br/>profile: browser"]
        PG[("Postgres<br/>jobs, job_pages, monitors,<br/>monitor_pages, monitor_checks,<br/>monitor_changes, logs")]
        RD[("Redis<br/>BullMQ queues, crawl frontier,<br/>visited sets, per-domain engine memory")]
    end

    subgraph external["Target sites / third parties"]
        SITE[Target website]
        HOOK[Webhook receiver]
        LLM["LLM provider<br/>Anthropic / OpenAI SDK"]
    end

    C -->|"REST: /scrape /crawl /extract, /jobs /monitors"| API
    API -->|"enqueue crawl/monitor jobs"| RD
    API -->|"read job/monitor state"| PG
    API -->|"serve /metrics, /jobs"| C

    WF -->|"BRPOP jobs"| RD
    WF -->|"write pages, heartbeats, logs"| PG
    WF -->|"fetch target page"| SITE
    WF -->|"CDP fallback if thin or blocked content"| LP
    WF -->|"POST job/monitor result"| HOOK
    WF -->|"AI judge relevance check"| LLM

    WB -->|"BullMQ crawl/monitor jobs, engine: browser"| RD
    WB --> LP
    WB --> SITE
    WB --> PG

    LP -.->|CDP| WB
```

## Request flow: synchronous scrape

```mermaid
sequenceDiagram
    participant Client
    participant API as api (Nest)
    participant Site as Target site

    Client->>API: POST /scrape url
    API->>Site: fetch url
    Site-->>API: HTML
    API->>API: cheerio strip plus turndown to markdown
    alt content suspiciously thin
        API->>API: browserScrape via Playwright/CDP
    end
    API-->>Client: markdown, title, links
```

## Job flow: async crawl plus webhook

```mermaid
sequenceDiagram
    participant Client
    participant API as api
    participant Redis
    participant Worker as worker-fetch
    participant Postgres
    participant Site as Target site
    participant Hook as Webhook receiver

    Client->>API: POST /crawl url, maxDepth, maxPages, webhookUrl
    API->>Postgres: insert jobs row, status queued
    API->>Redis: BullMQ enqueue crawl job
    API-->>Client: 202 job-id

    Redis-->>Worker: deliver crawl job
    Worker->>Postgres: status running
    loop frontier not empty, under maxPages
        Worker->>Redis: LPOP frontier
        Worker->>Site: fetch page, politeness delay, robots.txt check
        Site-->>Worker: HTML or 304/403/timeout
        opt thin content or blocked
            Worker->>Worker: browserScrape fallback, Lightpanda/Chromium
        end
        Worker->>Postgres: insert job_pages row
        Worker->>Redis: push newly discovered links to frontier
        Worker->>Postgres: update pages_scraped/failed plus heartbeat
    end
    Worker->>Postgres: status completed/failed
    Worker->>Hook: POST job-id, status, pages-scraped, results-url
```

## Monitor flow: scheduled diff plus AI judge

```mermaid
sequenceDiagram
    participant Redis
    participant Worker as worker-fetch (monitor worker)
    participant Postgres
    participant Site as Target site
    participant LLM as LLM provider
    participant Hook as Webhook receiver

    Redis-->>Worker: repeatable monitor job, per monitor schedule
    Worker->>Postgres: load monitor plus prior monitor_pages hashes
    Worker->>Worker: runCrawl, same crawl logic, conditional GET via ETag/Last-Modified
    Worker->>Site: fetch pages
    Worker->>Postgres: upsert monitor_pages, insert monitor_checks
    alt content hash changed
        Worker->>Postgres: insert monitor_changes diff
        opt monitor.goal is set
            Worker->>LLM: judge prompt, is this diff relevant to goal
            LLM-->>Worker: relevant, reason
        end
        Worker->>Hook: POST monitor-id, changes, only relevant changes if goal set
    end
```

## Maintenance loop

```mermaid
flowchart LR
    T1["repeatable job: check-orphans<br/>every 60s"] --> W[maintenance worker]
    T2["repeatable job: log-retention<br/>cron 0 3 * * *"] --> W
    W -->|"requeue stale running jobs with remaining frontier items"| RD[(Redis)]
    W -->|"delete logs older than LOG_RETENTION_DAYS"| PG[(Postgres)]
```

## Notes on what the diagrams simplify

- `lightpanda` and `worker-browser` only exist when the `browser` Docker
  Compose profile is enabled; a fetch-only install never starts them.
- The `crawl` and `monitor` BullMQ queues share the same worker process
  (`fetch.worker.ts`) and the same `runCrawl()` core logic: monitor
  runs are crawls with a `monitorId` attached for diffing, not a
  separate code path.
- `api` and `worker-fetch` are separate containers but share the same
  built image (`dist/`); they differ only in the container `command`.
