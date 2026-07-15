CREATE TABLE IF NOT EXISTS scrape_requests (
  id SERIAL PRIMARY KEY,
  url TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'scrape',
  engine TEXT,
  status TEXT NOT NULL DEFAULT 'ok',
  duration_ms INTEGER,
  markdown_length INTEGER,
  title TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS scrape_requests_created_at_idx ON scrape_requests (created_at DESC);
