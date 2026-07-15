# Contributing to Quarry

Thanks for considering a contribution. Quarry is a small, self-hosted
project — the bar for changes is "does this make self-hosting Quarry
better," not "does this add a feature."

## Development setup

```bash
pnpm install
cp .env.example .env   # point DATABASE_URL and REDIS_URL at local instances
```

For a full local stack (Postgres, Redis, API, worker) with live reload:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

Or run services directly against your own Postgres/Redis:

```bash
pnpm build
pnpm db:migrate
pnpm start:dev       # API, watch mode
pnpm start:worker    # fetch + monitor worker
```

## Before opening a PR

```bash
pnpm lint            # eslint --fix
pnpm build
pnpm test            # unit tests
pnpm test:e2e        # e2e tests, needs a live Postgres + Redis
```

CI runs the same checks against real Postgres/Redis service containers
on every push and PR — see `.github/workflows/ci.yml`.

## Scope

- Bug fixes, docs fixes, and test coverage are always welcome.
- For anything that changes architecture or adds a new endpoint/feature,
  please open an issue first to discuss before writing code — see
  `docs/architecture.md` for how the pieces fit together today.
- Keep PRs focused. A bug fix doesn't need an accompanying refactor.

## Commit style

Plain, descriptive commit messages explaining *why* a change was made,
not just what changed. No strict format enforced.

## Reporting bugs

Open a GitHub issue with: what you expected, what happened, and enough
to reproduce (Quarry version/commit, relevant `.env` config with
secrets redacted, and logs if available). See `SECURITY.md` instead if
the issue is a security vulnerability.
