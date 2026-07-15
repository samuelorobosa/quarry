# Quarry — AGENTS.md

This is the repo-level entry point for agentic context, following the
cross-tool `AGENTS.md` convention rather than a Claude-specific file —
any AI coding assistant working in this repo should read this first.
Reusable, narrow procedures (not project-wide context like this file)
belong in `.agents/skills/` instead, following the same cross-tool
convention rather than `.claude/skills/`.

This document covers stack and architecture decisions that apply across
all phases (P0-P3). Phase-specific scope and feature decisions live in
their own documents under `docs/product-direction/`, indexed in
`ROADMAP.md`.

---

## Naming convention

- **Database columns + variables:** `snake_case` (`pages_scraped`,
  `webhook_url`, `log_retention_days`).
- **Functions / methods:** `camelCase` (`scheduleLogRetention`,
  `deleteOldLogs`).
- **File names + JSON API payload keys:** `kebab-case`
  (`log-retention.service.ts`, `0001-init.sql`; wire fields like
  `"max-depth"`, `"webhook-url"`, `"job-id"`).
- **Class names stay PascalCase** (`JobsController`) — NestJS's
  decorators, DI, and module resolution key off class identity in ways
  the framework's own conventions assume PascalCase. Not ours to
  override.
- **npm package names stay kebab-case** (`@quarry/types`) — an npm
  registry constraint, not ours to override (and consistent with the
  file-naming rule anyway).
- **Config files with tool-mandated names** (`package.json`,
  `docker-compose.yml`, `.env`) keep whatever name the tool itself
  requires to find them.

**The real cost of this split, worth knowing up front:** the same
concept can legitimately have three different spellings depending on
layer — e.g. the webhook URL is `webhook_url` as a Postgres column,
`webhook-url` on the wire in JSON, and `webhook_url` again as a
variable once parsed into code. Since `kebab-case` isn't valid syntax
for a TypeScript object property without quoting it (`obj["webhook-url"]`,
no dot access), DTOs that map directly to JSON request/response bodies
need an explicit transform at the API boundary — either quoted property
names with bracket access, or a serialization layer that converts
kebab-case wire keys to snake_case internal properties and back. Decide
this concretely once `apps/api` is scaffolded; don't let NestJS's default
camelCase auto-mapping happen by accident.

---

## Project basics

- **Name:** Quarry
- **License:** AGPL-3.0 — self-hosters can run it freely; anyone who
  modifies it and offers it as a network service must release their
  source too. As sole copyright holder, this doesn't bind your own use
  inside Chatgrow — only other people's use of the public repo.
- **Deployment model:** self-hosted only. No managed cloud version, no
  multi-tenant billing, no SaaS surface. Optimized for "install on your
  own server," not "sign up for an account."

---

## Language & frameworks

**TypeScript, end to end.**

| Layer | Choice |
|---|---|
| API | NestJS (Express adapter by default) |
| Workers | Plain Node/TypeScript — no NestJS structure needed for queue consumers |
| Queue | BullMQ (Redis-backed) |
| HTML parsing | Cheerio |
| HTML → Markdown | Turndown |

**Why TypeScript over Go/Python**, in short:
- Playwright's most mature bindings are Node-first; the browser worker
  is the hardest part of this system, so it gets the best-supported
  language.
- Shared types between Quarry and Chatgrow (also TypeScript) — no
  duplicate schema maintenance across two languages.
- The whole workload is I/O-bound (waiting on network responses), which
  is exactly what Node's event loop is built for. Go's concurrency
  advantage matters most under CPU-bound or extremely high-throughput
  conditions Quarry isn't operating at.
- Firecrawl itself ships in TypeScript/Node — not fighting the grain of
  what this category of tool wants to be built in.

**Where this could change later, narrowly:** if `worker-fetch` ever
needs to sustain very high concurrent throughput across many domains
(not just a handful of Chatgrow client sites), it has the cleanest
possible API boundary (URL in, HTML out) to rewrite in Go without
touching anything else. Not worth doing preemptively.

**On raw performance:** NestJS's own overhead (DI container, decorator
routing) is sub-millisecond to low-single-digit-ms per request — never
the bottleneck here. The actual constraints are, in order: Quarry's own
per-domain rate limiting (200-500ms between requests, deliberately
self-imposed to avoid blocks), the target site's response time, and
browser rendering cost when invoked. If raw HTTP throughput ever
mattered, `@nestjs/platform-fastify` is a drop-in adapter swap (same
decorator code, ~2x throughput in benchmarks) — not needed yet.

---

## Data layer

**Postgres** — durable, structured, queryable data: `jobs`, `job_pages`,
`monitors`, `monitor_pages`, `monitor_checks`, `monitor_changes`, `logs`.
Schema lives in `migrations/0001-init.sql`.

**Query layer: Drizzle**, not Prisma. Chosen specifically because it
fits Quarry's existing constraints rather than general popularity:
- No separate engine binary — a thin TypeScript wrapper over SQL with
  near-zero runtime overhead, in keeping with the same minimal-footprint
  reasoning behind the Lightpanda choice.
- The SQL migration already existed by hand before this decision;
  Drizzle layers naturally on top of raw SQL, where Prisma expects its
  own schema language to be the source of truth.
- Plain TypeScript schema objects make snake_case end-to-end trivial —
  no fighting a tool whose idiomatic convention is camelCase-mapped-to-
  snake_case columns.

**Migration workflow — source of truth stays the hand-written SQL.**
`migrations/*.sql` is authoritative; `db/schema.ts` is a typed mirror of
it, not a generator for it. `drizzle-kit` (`drizzle.config.ts`) is wired
up for introspection/Studio tooling only — `drizzle-kit generate` is
deliberately not part of this workflow. When the schema changes, update
the SQL migration and `db/schema.ts` together, by hand, in the same
commit.

**Redis** — fast, ephemeral, high-churn state: the BullMQ job queue,
per-crawl frontier (`crawl:{jobId}:frontier`) and visited-set
(`crawl:{jobId}:visited`), and per-domain engine memory (which domains
have already triggered the Chromium fallback).

**Why both, not one:** Redis is built for "push/pop thousands of times a
second" workloads that don't need to persist past a job's lifetime;
Postgres is built for data that needs to survive restarts and be
queried with real structure later. Using each for what it's good at
avoids Postgres doing unnecessary disk writes for data nobody needs
after a crawl finishes.

---

## Browser / rendering layer

**Lightpanda** is the default browser engine — a from-scratch headless
browser (Zig, V8 for JS execution) built specifically for automation,
not human browsing. No graphical rendering engine at all, which is
where its ~9-16x memory advantage over Chromium comes from.

- Runs as its own container, talks CDP on an internal-only port.
- **Beta software** — most sites work, but complex SPAs occasionally
  don't render correctly yet. This is a known, acknowledged limitation
  of the project itself, not a guess.

**Chromium (via Playwright)** is the fallback, bundled in the same
`worker-browser` image:
- Triggered automatically per-page if Lightpanda fails to render
  (timeout, crash, or suspiciously thin content).
- Once a domain triggers the fallback, the rest of that domain's pages
  in the same job route straight to Chromium — no point re-trying
  Lightpanda page-by-page on a site already known not to render there.
- Each page result is tagged with which engine actually rendered it
  (`engine: lightpanda | chromium`), for visibility into how often the
  fallback fires.
- Installed in the image at build time regardless of whether it's ever
  invoked — disk cost, not RAM cost, until actually launched.

Both the browser engine and the fetch-only path stay behind a
`profiles: ["browser"]` gate in Docker Compose — anyone scraping only
static sites never pulls either image.

---

## Deployment & operations

**Install:** a single idempotent `install.sh`, modeled on Coolify's
nine-step pattern — detects OS, installs Docker if missing, creates
directories, clones/updates source, generates `.env` with random
secrets (only on first run), starts services, health-checks before
declaring success. Supports `--enable-browser` to turn the browser
worker on later without disturbing an existing install.

**Containers:** `postgres`, `redis`, `api`, `worker-fetch` always run;
`lightpanda` and `worker-browser` are profile-gated. All six sit on one
bridge network (`quarry-net`); only `api`'s port is published to the
host.

**Production overrides** (`docker-compose.prod.yml`): `restart:
unless-stopped` and log rotation (10MB × 3 files) on every service, plus
memory ceilings sized per component — tight for Postgres/Redis/API
(256MB-1GB), tight for Lightpanda specifically (512MB, reflecting its
real footprint), generous for `worker-browser` (3GB, sized for the
Chromium fallback path rather than Lightpanda's actual usage).

**Hardware sizing**, three tiers:
- Minimal/dev, no browser worker: 2 vCPU / 4GB RAM
- Production, Lightpanda as the engine: 4 vCPU / 8GB RAM
- Production with Chromium fallback used often: 4-8 vCPU / 16GB RAM

**Colocating with a startup's own backend/frontend:** doable, but cap
resources tightly (the `mem_limit`s above exist precisely for this) and
consider scheduling heavy crawls off-peak. Move Quarry to its own server
once crawling is frequent/heavy, or if the colocated app is
latency-sensitive enough that any contention is costly.

---

## Monitoring & logs

- **Container logs** (`docker compose logs -f <service>`): raw
  stdout/stderr, rotated, good for "is the process crashing," not
  queryable by job and not durable past rotation.
- **Structured logs** (Postgres `logs` table): job/monitor-scoped,
  leveled (`debug|info|warn|error`), with JSON context — what actually
  answers "why did this specific job fail" after the fact.
- **Retention:** `LOG_RETENTION_DAYS` (default 30, configurable via
  `.env`), enforced by a daily BullMQ repeatable job
  (`log-retention.service.ts`) that deletes anything older. Same
  scheduling pattern as monitors — no separate cron infra.
- **`/metrics`** (Prometheus format) and a bare server-rendered
  `/jobs` page cover visibility without building a dashboard — see
  see `ROADMAP.md` and `docs/product-direction/` for what's deferred vs.
  built per phase.

---

## Explicitly deferred (not part of the stack yet)

- **SDKs** — Chatgrow calls the REST API directly; maybe a shared
  `@quarry/types` package later, not a full client library, until a
  second external consumer exists.
- **Dashboard UI** — `/metrics` + `/jobs` cover the actual need;
  revisit only with real external user demand.
- **Proxy rotation / stealth** — only added if a real target site
  blocks the plain fetch worker; not built speculatively.
- **AI judge (goal-based monitor filtering)** — depends on P2's LLM
  plumbing for `/extract`; arrives as a monitor enhancement once that
  exists, not before.