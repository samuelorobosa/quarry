# Quarry — P1 Product Direction: Crawl, Job System & Change Monitoring

**Status:** Implemented — frozen. Implementation is complete; this doc
reflects the decisions as built. Any scope changes go in a new phase doc,
not here. See `ROADMAP.md` for current phase status.

> Stack and architecture decisions that apply project-wide (language,
> database choices, browser engine, deployment model, naming
> conventions) live in `AGENTS.md`. This document covers P1-specific
> scope only. JSON examples below use kebab-case for wire field names
> per `AGENTS.md`'s naming convention; references to database columns
> and Redis key templates (e.g. `last_content_hash`, `{job_id}`) stay
> snake_case, since those are a different layer than the wire format.

## Goal

Turn single-page scraping (P0) into multi-page crawling, with async job
tracking so a caller (Chatgrow) can fire off a crawl and get notified when
it's done — without polling, without duplicate pages, without a crawl that
silently runs forever. On top of that, let a crawl be saved as a recurring
**monitor** that re-checks a site on a schedule and reports what changed,
so Chatgrow's agent context can stay current without manual re-crawling.

**Definition of done:** point `/crawl` at a real client site Chatgrow
serves today, get back clean markdown for every reachable page under the
configured cap, receive a webhook when it finishes, with zero duplicate
pages scraped and zero crawls that exceed their bounds. Additionally: save
that crawl as a monitor, have it auto re-run on schedule, and get a
webhook firing only the pages that actually changed since last check.

---

## In scope

### 1. `POST /crawl`

Request:
```json
{
  "url": "https://example.com",
  "max-depth": 3,
  "max-pages": 100,
  "include-patterns": ["/products/*", "/faq/*"],
  "exclude-patterns": ["/blog/*"],
  "webhook-url": "https://chatgrow.internal/webhooks/crawl-complete"
}
```

Response (immediate, job is async):
```json
{ "job-id": "job_8f2a1c", "status": "queued" }
```

Defaults: `max-depth=2`, `max-pages=100`. Both are hard caps — no
unbounded crawls, ever.

### 2. URL discovery

- Check `/sitemap.xml` first. If present, use it as the primary page list
  — fast, accurate, no guessing.
- If no sitemap (or it's incomplete), fall back to link-following from the
  root page, expanding outward up to `max-depth`.
- Respect `robots.txt` — skip disallowed paths entirely, don't even queue
  them.
- Apply `include-patterns`/`exclude-patterns` before queuing a URL, not
  after scraping it (don't waste a fetch on something we're going to
  discard).

### 3. Dedup + frontier

- A Redis set per job (`crawl:{job_id}:visited`) tracks every URL already
  scraped or queued, so nav menus linking back to already-seen pages don't
  cause duplicate work.
- A Redis list/queue per job (`crawl:{job_id}:frontier`) holds URLs waiting
  to be scraped. Workers pop from this until it's empty or `max-pages` is
  hit.
- Normalize URLs before dedup checks (strip trailing slashes, sort query
  params, drop fragments) — otherwise `/about` and `/about/` count as two
  pages.

### 4. Politeness / rate limiting

- Minimum delay between requests to the *same domain* (200–500ms
  default, configurable). This alone avoids most accidental rate-limit
  blocks on small business sites — no proxy needed at this phase.
- If a domain starts returning 429/403, back off exponentially before
  retrying that domain specifically; don't let one slow/blocking domain
  stall other jobs.

### 5. Job status tracking

`GET /jobs/:id`:
```json
{
  "job-id": "job_8f2a1c",
  "status": "running",
  "pages-discovered": 47,
  "pages-scraped": 12,
  "pages-failed": 0,
  "started-at": "2026-06-20T10:00:00Z",
  "results": [
    { "url": "https://example.com/faq", "status": "scraped" }
  ]
}
```

Status lifecycle: `queued → running → completed | failed`.
A job is `failed` only if it can't proceed at all (e.g. root URL
unreachable) — individual page failures inside a crawl don't fail the
whole job, they just get logged per-page and the crawl continues.

### 6. Webhook callback

On `completed` or `failed`, `POST` to the job's `webhook-url`:
```json
{
  "job-id": "job_8f2a1c",
  "status": "completed",
  "pages-scraped": 46,
  "pages-failed": 1,
  "results-url": "/jobs/job_8f2a1c"
}
```
Send the summary + a link to fetch full results, not the full markdown
payload inline — keeps the webhook small and lets the caller fetch full
content only when it actually needs it.

### 7. Minimal `/jobs` page

Server-rendered HTML, no frontend framework. Lists recent jobs with
status, page counts, and timestamps. Exists purely so you can eyeball
"did that crawl finish, did it fail, why" during dogfooding without
grepping logs.

### 8. Change monitoring

A monitor is a saved crawl config that re-runs itself on a schedule
instead of running once.

`POST /monitors`:
```json
{
  "url": "https://example.com",
  "max-depth": 2,
  "max-pages": 100,
  "frequency": "daily",
  "webhook-url": "https://chatgrow.internal/webhooks/site-changed"
}
```
Returns `{ "monitor-id": "mon_3a9f", "status": "active" }`.

**Mechanics:**
- Each monitor's crawl config is stored (Postgres), and a BullMQ
  *repeatable* job is scheduled at the given `frequency` — no new
  scheduling infra needed, BullMQ supports cron-style repeatable jobs
  natively.
- On each run, re-crawl using the saved config, then for every page:
  hash the new content and compare against `last_content_hash` stored
  from the previous run.
- If a page's hash differs, compute a content diff (changed sections,
  not just "this page changed") and mark it `changed`; otherwise
  `unchanged`.
- After a full monitor run, fire one webhook summarizing only the
  changed pages — not the full site, since the caller already has the
  unchanged content from the last run:
```json
{
  "monitor-id": "mon_3a9f",
  "checked-at": "2026-06-20T10:00:00Z",
  "pages-checked": 46,
  "pages-changed": 2,
  "changes": [
    { "url": "https://example.com/pricing", "diff": "..." }
  ]
}
```
- `GET /monitors/:id` and `DELETE /monitors/:id` for management — list
  current monitors, see last-checked time, turn one off.

**Deferred, not abandoned — the AI judge.** Firecrawl's monitor takes a
plain-English `goal` (e.g. "alert me when pricing changes") and uses an
LLM to score each diff against it, filtering out noise like copyright-year
bumps or rotated testimonials. P1's monitor doesn't have this — it fires
on *any* detected change, including irrelevant ones. This isn't cut for
being AI-averse; P2 already requires LLM calls for schema-based
`/extract`, so the judge step slots in naturally once that plumbing
exists, rather than building LLM integration twice. Until then, P1's
monitor is usable but noisier than the long-term version.

**Deliberately not included here:** re-embedding/re-indexing the changed
content into Chatgrow's RAG store. That's Chatgrow's responsibility on
receiving the webhook, not this service's — keeps the scraper from
needing to know anything about Chatgrow's vector store or embedding
pipeline.

---

## Explicitly out of scope for P1

- Schema-based extraction (`/extract`) — that's P2.
- AI judge / goal-based filtering on monitor diffs — depends on P2's LLM
  plumbing; arrives as a monitor enhancement once that exists, not as
  part of P1 itself.
- Proxy rotation / stealth — only added if a real target site blocks the
  plain fetch worker.
- Browser worker enabled by default — fetch worker only unless a page is
  flagged as JS-rendered.
- Re-embedding/re-indexing changed content into Chatgrow's RAG store —
  the monitor reports *what* changed, Chatgrow decides what to do with
  that.
- Auth on the crawl API — fine for now since it's internal-network-only
  between Chatgrow and the scraper service.

---

## Decisions

These were open questions; resolving them now so they don't get
decided ad-hoc mid-build.

**Runaway crawls on huge sites → cap discovery, not just scraping.**
Sitemap parsing stops once it's collected `max-pages * 3` candidate URLs
(enough buffer to survive include/exclude filtering) or after a hard
30-second discovery timeout, whichever comes first. If the sitemap
itself is enormous or slow to fetch, bail out of sitemap parsing and
fall back to link-following from the root instead of hanging the job
before a single page is scraped.

**Job state on restart → resume, never restart from scratch.**
The frontier and visited-set already live in Redis, not in worker
memory, so a restart doesn't lose crawl state by default — the gap is
that nothing currently *notices* a job got orphaned. Fix: every page
scraped updates a `last_heartbeat_at` timestamp on the job. On worker
boot (and periodically), check for jobs in `running` status whose
heartbeat is stale (>2 minutes), and re-enroll their remaining frontier
items into the active queue rather than leaving them stuck or marking
them failed. A crash mid-crawl costs a couple minutes of delay, not the
whole crawl.

**Per-page failure type → adopt the enum, no flat boolean.**
Each page result gets `status: scraped | not_found | blocked | timeout |
error`. Cheap to add now, and means Chatgrow can later decide to treat
`blocked` differently from `not_found` (e.g. retry blocked pages with a
different strategy later) without a schema change.

**Monitor cost at scale → conditional GET from day one, not deferred.**
Rather than waiting until cost becomes a real problem, monitors send
`If-Modified-Since`/`If-None-Match` headers on every re-check from the
start. A `304 Not Modified` response short-circuits that page as
`unchanged` with no re-render or diffing needed. Full fetch + hash
comparison only runs when the origin returns `200` or doesn't support
conditional headers at all. This is a small amount of extra work now
that avoids a wasted full re-scrape on every check for the (common)
case of static or rarely-changing pages.