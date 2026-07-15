import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, serial, text, timestamp, unique } from 'drizzle-orm/pg-core';

export const jobs = pgTable('jobs', {
  id: text('id').primaryKey(),
  status: text('status').notNull().default('queued'),
  url: text('url').notNull(),
  max_depth: integer('max_depth').notNull().default(2),
  max_pages: integer('max_pages').notNull().default(100),
  include_patterns: text('include_patterns').array().notNull().default(sql`'{}'`),
  exclude_patterns: text('exclude_patterns').array().notNull().default(sql`'{}'`),
  webhook_url: text('webhook_url'),
  pages_discovered: integer('pages_discovered').notNull().default(0),
  pages_scraped: integer('pages_scraped').notNull().default(0),
  pages_failed: integer('pages_failed').notNull().default(0),
  started_at: timestamp('started_at', { withTimezone: true }),
  completed_at: timestamp('completed_at', { withTimezone: true }),
  last_heartbeat_at: timestamp('last_heartbeat_at', { withTimezone: true }),
  error: text('error'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const job_pages = pgTable('job_pages', {
  id: serial('id').primaryKey(),
  job_id: text('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  status: text('status').notNull().default('queued'),
  engine: text('engine'),
  markdown: text('markdown'),
  title: text('title'),
  error: text('error'),
  duration_ms: integer('duration_ms'),
  markdown_length: integer('markdown_length'),
  scraped_at: timestamp('scraped_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('job_pages_job_id_idx').on(t.job_id),
]);

export const monitors = pgTable('monitors', {
  id: text('id').primaryKey(),
  url: text('url').notNull(),
  max_depth: integer('max_depth').notNull().default(2),
  max_pages: integer('max_pages').notNull().default(100),
  include_patterns: text('include_patterns').array().notNull().default(sql`'{}'`),
  exclude_patterns: text('exclude_patterns').array().notNull().default(sql`'{}'`),
  frequency: text('frequency').notNull().default('daily'),
  webhook_url: text('webhook_url').notNull(),
  status: text('status').notNull().default('active'),
  repeat_job_key: text('repeat_job_key'),
  goal: text('goal'),
  last_checked_at: timestamp('last_checked_at', { withTimezone: true }),
  last_job_id: text('last_job_id'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const monitor_pages = pgTable('monitor_pages', {
  id: serial('id').primaryKey(),
  monitor_id: text('monitor_id').notNull().references(() => monitors.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  last_content_hash: text('last_content_hash'),
  last_markdown: text('last_markdown'),
  last_etag: text('last_etag'),
  last_modified: text('last_modified'),
  last_checked_at: timestamp('last_checked_at', { withTimezone: true }),
}, (t) => [
  index('monitor_pages_monitor_id_idx').on(t.monitor_id),
  unique('monitor_pages_monitor_id_url_uniq').on(t.monitor_id, t.url),
]);

export const monitor_checks = pgTable('monitor_checks', {
  id: serial('id').primaryKey(),
  monitor_id: text('monitor_id').notNull().references(() => monitors.id, { onDelete: 'cascade' }),
  job_id: text('job_id'),
  pages_checked: integer('pages_checked').notNull().default(0),
  pages_changed: integer('pages_changed').notNull().default(0),
  checked_at: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
});

export const monitor_changes = pgTable('monitor_changes', {
  id: serial('id').primaryKey(),
  check_id: integer('check_id').notNull().references(() => monitor_checks.id, { onDelete: 'cascade' }),
  monitor_id: text('monitor_id').notNull(),
  url: text('url').notNull(),
  diff: text('diff'),
  changed_at: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
});

export const scrape_requests = pgTable('scrape_requests', {
  id: serial('id').primaryKey(),
  url: text('url').notNull(),
  source: text('source').notNull().default('scrape'),
  engine: text('engine'),
  status: text('status').notNull().default('ok'),
  duration_ms: integer('duration_ms'),
  markdown_length: integer('markdown_length'),
  title: text('title'),
  error: text('error'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('scrape_requests_created_at_idx').on(t.created_at),
]);

export const logs = pgTable('logs', {
  id: serial('id').primaryKey(),
  job_id: text('job_id'),
  monitor_id: text('monitor_id'),
  level: text('level').notNull().default('info'),
  message: text('message').notNull(),
  context: jsonb('context'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('logs_job_id_idx').on(t.job_id),
  index('logs_monitor_id_idx').on(t.monitor_id),
  index('logs_created_at_idx').on(t.created_at),
]);
