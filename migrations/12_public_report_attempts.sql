-- 12_public_report_attempts.sql
--
-- Rate-limiting store for the public /b/<bike-id> customer-report form
-- (M6 push #4). One row per submission attempt; the action counts rows
-- per (ip, last hour) and refuses past a threshold.
--
-- Could've gone to Vercel KV / Redis, but the volume is tiny (a Danish
-- bike shop, maybe a few reports a day) and Postgres latency is fine
-- for a form submission. The DB is already deployed, no extra service
-- to manage. See conversation 2026-05-21.

CREATE TABLE public.public_report_attempts (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ip          inet NOT NULL,
    bike_id     uuid NOT NULL REFERENCES public.bikes(id) ON DELETE CASCADE,
    -- Set after the attempt succeeds; null when the rate limit blocked it.
    ticket_id   uuid REFERENCES public.maintenance_tickets(id) ON DELETE SET NULL,
    created_at  timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_public_report_attempts_ip_created
    ON public.public_report_attempts (ip, created_at);

-- For periodic cleanup (rows older than 7 days are dead weight; a daily
-- cron or a manual DELETE handles it).
CREATE INDEX idx_public_report_attempts_created
    ON public.public_report_attempts (created_at);
