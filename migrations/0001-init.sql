CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'queued',
  url TEXT NOT NULL,
  max_depth INTEGER NOT NULL DEFAULT 2,
  max_pages INTEGER NOT NULL DEFAULT 100,
  include_patterns TEXT[] NOT NULL DEFAULT '{}',
  exclude_patterns TEXT[] NOT NULL DEFAULT '{}',
  webhook_url TEXT,
  pages_discovered INTEGER NOT NULL DEFAULT 0,
  pages_scraped INTEGER NOT NULL DEFAULT 0,
  pages_failed INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_heartbeat_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS job_pages (
  id SERIAL PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  engine TEXT,
  markdown TEXT,
  title TEXT,
  error TEXT,
  scraped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS job_pages_job_id_idx ON job_pages(job_id);

CREATE TABLE IF NOT EXISTS monitors (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  max_depth INTEGER NOT NULL DEFAULT 2,
  max_pages INTEGER NOT NULL DEFAULT 100,
  include_patterns TEXT[] NOT NULL DEFAULT '{}',
  exclude_patterns TEXT[] NOT NULL DEFAULT '{}',
  frequency TEXT NOT NULL DEFAULT 'daily',
  webhook_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  repeat_job_key TEXT,
  last_checked_at TIMESTAMPTZ,
  last_job_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS monitor_pages (
  id SERIAL PRIMARY KEY,
  monitor_id TEXT NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  last_content_hash TEXT,
  last_markdown TEXT,
  last_etag TEXT,
  last_modified TEXT,
  last_checked_at TIMESTAMPTZ,
  UNIQUE(monitor_id, url)
);

CREATE INDEX IF NOT EXISTS monitor_pages_monitor_id_idx ON monitor_pages(monitor_id);

CREATE TABLE IF NOT EXISTS monitor_checks (
  id SERIAL PRIMARY KEY,
  monitor_id TEXT NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  job_id TEXT,
  pages_checked INTEGER NOT NULL DEFAULT 0,
  pages_changed INTEGER NOT NULL DEFAULT 0,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS monitor_changes (
  id SERIAL PRIMARY KEY,
  check_id INTEGER NOT NULL REFERENCES monitor_checks(id) ON DELETE CASCADE,
  monitor_id TEXT NOT NULL,
  url TEXT NOT NULL,
  diff TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS logs (
  id SERIAL PRIMARY KEY,
  job_id TEXT,
  monitor_id TEXT,
  level TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  context JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS logs_job_id_idx ON logs(job_id);
CREATE INDEX IF NOT EXISTS logs_monitor_id_idx ON logs(monitor_id);
CREATE INDEX IF NOT EXISTS logs_created_at_idx ON logs(created_at);
