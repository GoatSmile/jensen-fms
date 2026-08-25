-- ============================================================================
-- 84 — A name on every bike status change
-- ============================================================================
-- `bike_state_log.actor_id` has existed since day one and is NULL on all 55
-- rows, because the trigger that writes them cannot see who is logged in:
-- PostgREST hands out pooled connections with no session context, so there is
-- no `current_setting('app.person_id')` to read.
--
-- Rather than route every status change through an RPC that sets a
-- transaction-local setting — which would fight the app's PostgREST-everywhere
-- style — the actor RIDES ALONG on the row being written. The app sets
-- `bikes.last_actor_id` in the same UPDATE that changes `status`; the trigger
-- copies it into the log row. The trigger keeps its guarantee that no
-- transition escapes unlogged, and attribution arrives with no session
-- plumbing at all.
--
-- `last_actor_id` is deliberately NOT "who owns this bike" or "who touched it
-- last" in any broader sense: it is scratch space for the trigger, meaningful
-- only at the instant of a status write. Read the LOG for history, never this
-- column.

ALTER TABLE bikes ADD COLUMN last_actor_id UUID REFERENCES people(id);

COMMENT ON COLUMN bikes.last_actor_id IS
    'Scratch space: who is making the current status write, read by '
    'log_bike_state_change() into bike_state_log.actor_id. Not history — '
    'read bike_state_log for that.';

CREATE OR REPLACE FUNCTION public.log_bike_state_change()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
        INSERT INTO bike_state_log (bike_id, from_status, to_status, occurred_at, actor_id)
        VALUES (NEW.id, OLD.status, NEW.status, NOW(), NEW.last_actor_id);
    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO bike_state_log (bike_id, from_status, to_status, occurred_at, actor_id)
        VALUES (NEW.id, NULL, NEW.status, NOW(), NEW.last_actor_id);
    END IF;
    RETURN NEW;
END;
$function$;
