DEV_COMPOSE  = docker compose -f docker-compose.yml -f docker-compose.dev.yml
PROD_COMPOSE = docker compose -f docker-compose.yml -f docker-compose.prod.yml

# ── Dev ───────────────────────────────────────────────────────────────────────

dev:
	$(DEV_COMPOSE) --profile browser up --build

dev/down:
	$(DEV_COMPOSE) down

dev/clean:
	$(DEV_COMPOSE) down -v --remove-orphans
	$(DEV_COMPOSE) build --no-cache

dev/restart:
	$(DEV_COMPOSE) restart api worker-fetch

# ── Prod ──────────────────────────────────────────────────────────────────────

prod:
	$(PROD_COMPOSE) --profile browser up --build -d

prod/logs:
	$(PROD_COMPOSE) logs -f

prod/down:
	$(PROD_COMPOSE) down

# ── Shared ────────────────────────────────────────────────────────────────────

logs/api:
	$(DEV_COMPOSE) logs -f quarry-api

logs/worker:
	$(DEV_COMPOSE) logs -f quarry-worker

ps:
	$(DEV_COMPOSE) ps

migrate:
	$(DEV_COMPOSE) exec api sh -c "pnpm db:migrate"

.PHONY: dev dev/down dev/restart dev/clean prod prod/logs prod/down logs/api logs/worker ps migrate
