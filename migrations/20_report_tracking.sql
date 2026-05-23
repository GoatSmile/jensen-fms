-- 20_report_tracking.sql
--
-- Two new tables backing the /report customer surface:
--
-- 1. report_page_views — aggregate page-load counter. No PII, just
--    (path, timestamp). Used for "how often does the customer URL get
--    visited" charts on the dashboard + settings page.
--
-- 2. frame_lookup_attempts — rate-limit ledger for the
--    findBikeByFrameNumber server action. Separate from
--    public_report_attempts so a flood of bike-number guesses can be
--    throttled independently of legitimate submission attempts.
--
-- Both tables append-only. A retention cron can prune later; at expected
-- volumes (small Danish bike shop, low-thousands of events/year) we
-- don't need it yet.

CREATE TABLE IF NOT EXISTS report_page_views (
  id BIGSERIAL PRIMARY KEY,
  path TEXT NOT NULL,
  visited_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_page_views_path_time
  ON report_page_views(path, visited_at DESC);

COMMENT ON TABLE report_page_views IS
  'Aggregate page-view counter for /report customer surfaces. No PII — only path + timestamp. Tracker runs via Next.js after() so writes never block the response.';

CREATE TABLE IF NOT EXISTS frame_lookup_attempts (
  id BIGSERIAL PRIMARY KEY,
  ip INET NOT NULL,
  found BOOLEAN NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_frame_lookup_attempts_ip_time
  ON frame_lookup_attempts(ip, attempted_at DESC);

COMMENT ON TABLE frame_lookup_attempts IS
  'Per-IP rate-limit ledger for the public /report frame-number lookup. Logged on every attempt (success or miss) so we can throttle enumeration scans without blocking legitimate retries.';
