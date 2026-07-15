# Quarry — Roadmap

Status index across the full P0-P3 arc. This file is purely an index —
it doesn't restate scope. Each phase's actual scope, decisions, and
in/out-of-scope boundaries live in their own doc under
`docs/product-direction/`.

| Phase | What it covers | Status | Doc |
|---|---|---|---|
| **P0** | Single-page scrape → clean markdown. The minimum viable thing Chatgrow can use. | Implemented | _not yet written_ |
| **P1** | Multi-page crawl, async job system, webhooks, change monitoring | Implemented | [`docs/product-direction/p1-crawl-jobs-monitor.md`](docs/product-direction/p1-crawl-jobs-monitor.md) |
| **P2** | Schema-based `/extract`, AI judge for monitor filtering | Implemented | [`docs/product-direction/p2-extract-ai-judge.md`](docs/product-direction/p2-extract-ai-judge.md) |
| **P3** | OSS polish — docs, README, license headers, proxy/stealth if needed, dashboard | Implemented | _not yet written_ |

## How to use this file

- **Status** is the source of truth for "what phase are we actually in"
  — update it here, not by inferring from commit history or chat logs.
- **Design mode → build mode:** while a phase doc says "design mode," it
  can keep changing as decisions resolve. Once `apps/api` implementation
  starts against a phase's doc, that doc should mostly freeze (see the
  status header at the top of `p1-crawl-jobs-monitor.md` for what that
  means in practice). Update this table's status column when that
  transition happens.
- **New phase docs** get added here as a new table row + link the
  moment they're written, even in draft form — don't let a phase exist
  only in conversation history.

## Definition of done, overall

Chatgrow can point Quarry at a real client site, get back clean
markdown for AI-agent context, reliably extract a few structured fields
(P2), and get notified automatically when that site's content changes
(P1's monitor) — running entirely on Quarry's own self-hosted infra,
with zero dependency on a third-party scraping service.