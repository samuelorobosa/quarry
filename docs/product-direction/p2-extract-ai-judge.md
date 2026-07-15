# Quarry — P2 Product Direction: Structured Extraction & AI Judge

**Status:** In progress — design mode. This doc is still living and gets
edited in place as decisions resolve. Once `apps/api` implementation
starts against it, this should mostly freeze — see `ROADMAP.md` for
current phase status, and treat any post-freeze scope changes as an
explicit addendum at the bottom of this file, not a silent rewrite.

> Stack and architecture decisions that apply project-wide (language,
> database choices, browser engine, deployment model, naming
> conventions) live in `AGENTS.md`. This document covers P2-specific
> scope only. JSON examples below use kebab-case for wire field names
> per `AGENTS.md`'s naming convention; references to database columns
> stay snake_case.

## Goal

Add two things that build on each other: a `POST /extract` endpoint that
pulls structured fields from any page using an LLM, and an AI judge that
makes the P1 monitor smarter by only firing webhooks when a content change
is actually relevant to a stated goal.

Both share the same underlying piece — a config-driven `LlmService` that
abstracts over multiple LLM providers. That's the only new infrastructure
in P2. Everything above it (`/extract`, the judge) is prompt logic sitting
on top.

**Definition of done:** point `/extract` at a real client site, get back
clean structured JSON matching the schema you asked for. Create a monitor
with a `goal`, have it re-crawl on schedule, and confirm that irrelevant
changes (copyright year bump, rotating testimonials) do not fire the
webhook while relevant ones (pricing change, new product) do.

---

## In scope

### 1. LLM provider system

Config-driven via `.env`. Two provider paths — OpenAI-compatible (covers
most providers, including self-hosted) and Anthropic (different API format,
worth supporting natively given Chatgrow's stack).

```bash
# OpenAI-compatible — works for OpenAI, Groq, Together, Mistral, LM Studio,
# and any self-hosted model exposed via Ollama or vLLM
LLM_PROVIDER=openai
LLM_API_KEY=sk-...
LLM_MODEL=gpt-4o
LLM_BASE_URL=https://api.openai.com/v1   # override to point at Ollama etc.

# Anthropic
LLM_PROVIDER=anthropic
LLM_API_KEY=sk-ant-...
LLM_MODEL=claude-sonnet-4-6

# Local Ollama (OpenAI-compatible path, no real key needed)
LLM_PROVIDER=openai
LLM_BASE_URL=http://localhost:11434/v1
LLM_MODEL=llama3.2
LLM_API_KEY=ollama
```

`LlmService` exposes one method to the rest of the codebase:

```typescript
complete(prompt: string): Promise<string>
```

It switches on `LLM_PROVIDER`, calls the right SDK, and returns the raw
text response. Nothing above this layer knows which provider is underneath.
Callers are responsible for prompting and parsing — `LlmService` is
intentionally dumb.

**Packages:** `openai` (handles the OpenAI-compatible path, including custom
`baseURL`), `@anthropic-ai/sdk` (Anthropic). Both installed; only the
configured provider's SDK is called at runtime.

### 2. `POST /extract`

Scrapes a URL to markdown (reuses P0's `ScrapeService`) then calls the LLM
to pull structured fields matching the caller's schema.

Request:
```json
{
  "url": "https://example.com/pricing",
  "schema": {
    "plan-name": "string",
    "monthly-price": "number",
    "features": "array of strings",
    "is-available": "boolean"
  }
}
```

Response:
```json
{
  "url": "https://example.com/pricing",
  "data": {
    "plan-name": "Pro",
    "monthly-price": 49,
    "features": ["Unlimited users", "API access", "Priority support"],
    "is-available": true
  },
  "provider": "anthropic",
  "model": "claude-sonnet-4-6",
  "extracted-at": "2026-06-20T10:00:00Z"
}
```

**Schema format:** a flat JSON object where each key is the field name
(kebab-case, matching wire convention) and each value is a plain type hint
string: `"string"`, `"number"`, `"boolean"`, or `"array of strings"`. Not
full JSON Schema — the verbosity isn't worth it for the common case, and
the LLM doesn't need it. Nested objects are out of scope for P2.

**Prompt strategy:** the extraction prompt includes the full page markdown
and the schema as a JSON block, and asks the LLM to return a JSON object
with those exact keys. If a field can't be found on the page, the LLM
should return `null` for that key rather than hallucinating a value — this
is explicit in the prompt.

**If the LLM returns invalid JSON:** retry the call once with a clarifying
prompt ("your previous response was not valid JSON, please return only a
JSON object"). If the second attempt also fails, return a 502 with
`{ "error": "extraction-failed", "reason": "..." }`.

**Token budget:** if the scraped markdown exceeds 100k characters, truncate
to 100k before sending to the LLM and include a note in the prompt that
the content was truncated. This is a practical ceiling, not a hard design
limit — revisit if real pages routinely hit it.

**Synchronous, not async:** `/extract` waits for the LLM and returns inline.
Unlike `/crawl`, there's no job system needed here — the scrape is fast and
the LLM call is the only latency. If callers need async extraction over
many URLs, they can call `/crawl` first and then `/extract` per page; that's
a future concern, not a P2 one.

### 3. AI judge for monitors

Adds an optional `goal` field to `POST /monitors`. When present, each
monitor run passes its diffs through the LLM before deciding whether to
fire the webhook.

```json
{
  "url": "https://example.com",
  "frequency": "daily",
  "webhook-url": "https://chatgrow.internal/webhooks/site-changed",
  "goal": "alert me when pricing changes or new plans are added"
}
```

**Mechanics:**
- `goal` is stored on the `monitors` table (new `goal` column).
- After a monitor run collects its changed pages, if `goal` is set, each
  diff is sent to the LLM with a judgment prompt: "given this goal and this
  diff, is this change relevant? reply with JSON: `{ \"relevant\": true, \"reason\": \"...\" }`"
- Only diffs the LLM marks `relevant: true` are included in the webhook
  payload. If none are relevant, the webhook is not fired at all.
- The `reason` string is included per-change in the webhook:
```json
{
  "monitor-id": "mon_3a9f",
  "checked-at": "2026-06-20T10:00:00Z",
  "pages-checked": 46,
  "pages-changed": 2,
  "goal": "alert me when pricing changes or new plans are added",
  "changes": [
    {
      "url": "https://example.com/pricing",
      "diff": "...",
      "relevant": true,
      "reason": "Monthly price for Pro plan changed from $49 to $59"
    }
  ]
}
```
- If no `goal` is set, the monitor behaves exactly as P1 — fires on any
  detected change. Existing monitors are unaffected.

---

## Explicitly out of scope for P2

- Bulk extraction (multiple URLs in one `/extract` request) — callers can
  loop; not worth the added complexity until there's real demand.
- Caching extraction results — the page content changes; caching adds
  invalidation complexity with unclear benefit at this scale.
- Nested/complex schema types beyond the four supported type hints —
  flat schemas cover the practical cases Chatgrow needs today.
- Streaming responses from `/extract` — latency isn't a problem at one
  URL at a time.
- Fine-tuning or model management — providers handle this.

---

## Decisions

**Schema format: simple type hints, not JSON Schema.**
Full JSON Schema is the "correct" choice but it's verbose and unfamiliar
to most API callers. The four type hints (`string`, `number`, `boolean`,
`array of strings`) cover the overwhelming majority of real extraction use
cases. If a caller genuinely needs nested objects, they can extract the
parent as a string and parse it themselves. Upgrade path exists if real
demand appears — this isn't a one-way door.

**One `LlmService.complete()` method, not separate extract/judge methods.**
Keeping the LLM abstraction at the raw prompt level means prompt logic
stays with the feature that owns it (`ExtractService`, `MonitorsService`)
rather than leaking into the infrastructure layer. Easier to iterate on
prompts without touching shared code.

**Retry once on invalid JSON, then fail.**
Silent fallback (returning partial data, empty object, etc.) is worse
than a visible error — the caller can't tell the difference between "field
not on page" and "LLM failed to parse." One retry handles transient
formatting errors. Two retries is probably enough to recover from
any real JSON formatting issue; more than that burns tokens without
meaningfully improving reliability.

**Judge fires per-diff, not once for the whole run.**
Batching all diffs into one prompt is cheaper but the LLM response becomes
harder to parse and attribute back to individual URLs. One call per
changed page keeps the response simple and the attribution obvious. At
the scale Quarry is operating (not thousands of monitors), the extra calls
are not a cost concern.
