#!/bin/bash
set -euo pipefail

INSTALL_DIR="/opt/quarry"
REPO_URL="https://github.com/samuelorobosa/quarry"
COMPOSE_CMD="docker compose"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()    { echo -e "${GREEN}[quarry]${NC} $*"; }
warn()    { echo -e "${YELLOW}[quarry]${NC} $*"; }
error()   { echo -e "${RED}[quarry]${NC} $*" >&2; }


# ── Step 1: Check OS ──────────────────────────────────────────────────────────
info "Step 1/9 — Checking OS"
if [[ "$(uname)" != "Linux" ]]; then
  error "Quarry's installer targets Linux. On macOS/Windows, run Docker Compose manually."
  exit 1
fi

# ── Step 2: Check/install Docker ─────────────────────────────────────────────
info "Step 2/9 — Checking Docker"
if ! command -v docker &>/dev/null; then
  warn "Docker not found — installing via get.docker.com"
  curl -fsSL https://get.docker.com | sh
fi

if ! docker compose version &>/dev/null 2>&1; then
  error "Docker Compose v2 not found. Please upgrade Docker to 20.10+."
  exit 1
fi

docker info &>/dev/null || { error "Docker daemon is not running."; exit 1; }

# ── Step 3: Create install directory ─────────────────────────────────────────
info "Step 3/9 — Creating install directory at ${INSTALL_DIR}"
mkdir -p "$INSTALL_DIR"

# ── Step 4: Clone or update source ───────────────────────────────────────────
info "Step 4/9 — Fetching source"
if [[ -d "$INSTALL_DIR/.git" ]]; then
  git -C "$INSTALL_DIR" pull --ff-only
else
  git clone "$REPO_URL" "$INSTALL_DIR"
fi
cd "$INSTALL_DIR"

# ── Step 5: Generate .env (first run only) ───────────────────────────────────
info "Step 5/9 — Configuring environment"
if [[ ! -f "$INSTALL_DIR/.env" ]]; then
  POSTGRES_PASSWORD=$(openssl rand -hex 24)
  sed "s/changeme/${POSTGRES_PASSWORD}/g" .env.example > .env
  # Update DATABASE_URL to use generated password
  sed -i "s|postgresql://postgres:changeme@|postgresql://postgres:${POSTGRES_PASSWORD}@|g" .env
  info "Generated .env with random secrets — edit ${INSTALL_DIR}/.env to add LLM_API_KEY"
else
  warn ".env already exists — skipping generation (delete it to reset)"
fi

# ── Step 6: Build images ──────────────────────────────────────────────────────
info "Step 6/9 — Building Docker images"
COMPOSE_ARGS="-f docker-compose.yml -f docker-compose.prod.yml"
$COMPOSE_CMD $COMPOSE_ARGS build --quiet

# ── Step 7: Start services ────────────────────────────────────────────────────
info "Step 7/9 — Starting services"
$COMPOSE_CMD $COMPOSE_ARGS --profile browser up -d

# ── Step 8: Wait for health checks ───────────────────────────────────────────
info "Step 8/9 — Waiting for services to be healthy"
TIMEOUT=60
ELAPSED=0
until $COMPOSE_CMD $COMPOSE_ARGS ps | grep -E "postgres|redis" | grep -v "healthy" | wc -l | grep -q "^0$"; do
  sleep 2
  ELAPSED=$((ELAPSED + 2))
  if [[ $ELAPSED -ge $TIMEOUT ]]; then
    error "Services did not become healthy within ${TIMEOUT}s"
    $COMPOSE_CMD $COMPOSE_ARGS logs --tail=20
    exit 1
  fi
done

# ── Step 9: Health check the API ─────────────────────────────────────────────
info "Step 9/9 — Checking API"
PORT=$(grep '^PORT=' .env | cut -d= -f2 || echo 3000)
ELAPSED=0
until curl -sf "http://localhost:${PORT}/" &>/dev/null; do
  sleep 2
  ELAPSED=$((ELAPSED + 2))
  if [[ $ELAPSED -ge 30 ]]; then
    error "API did not respond within 30s — check logs: docker compose logs api"
    exit 1
  fi
done

echo ""
info "✓ Quarry is running at http://localhost:${PORT}"
info "  Dashboard : http://localhost:${PORT}/dashboard"
info "  Metrics   : http://localhost:${PORT}/metrics"
echo ""
warn "Next: add your LLM_API_KEY to ${INSTALL_DIR}/.env and restart:"
warn "  $COMPOSE_CMD $COMPOSE_ARGS restart api worker-fetch"
