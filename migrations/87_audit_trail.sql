-- ============================================================================
-- 87 — An audit trail for the changes that move money quietly
-- ============================================================================
-- DECISIONS 2026-08-25. `audit_log` has existed since the original schema with
-- zero rows and no triggers. This turns it on for a DELIBERATELY NARROW set:
-- the tables where a small edit produces no visible event and shows up weeks
-- later in money.
--
--   parts (price + duty)  default_retail_price moves every future quote;
--                        hs_code_id and origin decide the tariff and
--                        import-tax buckets snapshotted onto new PO lines
--   service_price_items  the painter's tier prices — feed template cost and
--                        the frozen price on a paint order
--   app_settings         default_transport_pct alters landed cost on every new
--                        PO line; provider selection decides what sends mail
--   people               engagement, active flag, language — and WHEN a
--                        password was set (the hash itself is redacted below)
--   bikes.built_by       the correction trail for who built it. Phase 1 made
--                        that a correctable claim; this is what makes
--                        correcting it safe rather than a quiet rewrite.
--
-- NOT everything: an audit row on every write is a haystack nobody searches,
-- and its value is inversely proportional to how much is in it.
--
-- DELIBERATELY DEFERRED — role_capabilities and person_roles. Both are edited
-- delete-then-insert (see syncPersonRoles), so a row-level trigger would
-- record twelve deletes and nine inserts for one edit, with no actor on the
-- deletes. Permission changes want ONE app-written summary row (before caps →
-- after caps), which is a different job.
--
-- WHO: a trigger cannot see the logged-in person — PostgREST pools
-- connections with no session context. Same answer as migration 84: the actor
-- rides along on the row (`last_actor_id`), and the trigger reads it. A writer
-- that forgets to set it produces a row with no name, which is visible as such
-- rather than silently wrong.

-- ---------------------------------------------------------------------------
-- The log itself
-- ---------------------------------------------------------------------------

-- PostgREST resolves an embed BY CONSTRAINT NAME, and a failed embed returns
-- no rows rather than an error (migration 86 learned this the hard way).
ALTER TABLE audit_log
    ADD CONSTRAINT audit_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES people(id);

-- app_settings is a singleton with a SMALLINT id, so it has no uuid to record.
-- entity_type still says which table it was.
ALTER TABLE audit_log ALTER COLUMN entity_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_log_entity
    ON audit_log (entity_type, entity_id, occurred_at DESC);

-- ---------------------------------------------------------------------------
-- Ride-along columns (bikes already has one from migration 84)
-- ---------------------------------------------------------------------------
ALTER TABLE parts               ADD COLUMN last_actor_id UUID REFERENCES people(id);
ALTER TABLE service_price_items ADD COLUMN last_actor_id UUID REFERENCES people(id);
ALTER TABLE app_settings        ADD COLUMN last_actor_id UUID REFERENCES people(id);
ALTER TABLE people              ADD COLUMN last_actor_id UUID REFERENCES people(id);

-- ---------------------------------------------------------------------------
-- One generic trigger function
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    v_old jsonb;
    v_new jsonb;
    v_changed text[];
    v_actor uuid;
    v_entity uuid;
    v_id text;
    -- Bookkeeping, not content: a change to these alone is not a change.
    k_ignored text[] := ARRAY['updated_at', 'last_actor_id'];
BEGIN
    v_old := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END;
    v_new := CASE WHEN TG_OP IN ('UPDATE','INSERT') THEN to_jsonb(NEW) END;

    -- Never store a credential, even a hashed one.
    IF v_old ? 'password_hash' AND v_old->>'password_hash' IS NOT NULL THEN
        v_old := jsonb_set(v_old, '{password_hash}', '"[redacted]"');
    END IF;
    IF v_new ? 'password_hash' AND v_new->>'password_hash' IS NOT NULL THEN
        v_new := jsonb_set(v_new, '{password_hash}', '"[redacted]"');
    END IF;

    IF TG_OP = 'UPDATE' THEN
        SELECT array_agg(key ORDER BY key) INTO v_changed
        FROM jsonb_each(v_new)
        WHERE v_new -> key IS DISTINCT FROM v_old -> key
          AND NOT (key = ANY(k_ignored));
        -- Nothing of substance moved: don't log a row saying so.
        IF v_changed IS NULL THEN
            RETURN NEW;
        END IF;
    END IF;

    v_actor := COALESCE(
        NULLIF(v_new ->> 'last_actor_id', ''),
        NULLIF(v_old ->> 'last_actor_id', '')
    )::uuid;

    v_id := COALESCE(v_new ->> 'id', v_old ->> 'id');
    -- Only a uuid id identifies a row here; app_settings' smallint does not.
    v_entity := CASE
        WHEN v_id ~ '^[0-9a-fA-F-]{36}$' THEN v_id::uuid
        ELSE NULL
    END;

    INSERT INTO audit_log (
        entity_type, entity_id, action, old_data, new_data, changed_fields, actor_id
    ) VALUES (
        TG_TABLE_NAME, v_entity, lower(TG_OP), v_old, v_new, v_changed, v_actor
    );

    RETURN COALESCE(NEW, OLD);
END;
$function$;

-- ---------------------------------------------------------------------------
-- The triggers
-- ---------------------------------------------------------------------------
-- Parts: only the columns that move money. `part_retail_prices` looked like
-- the right target and is not — it is empty, and nothing in the app writes it;
-- retail price lives on `parts.default_retail_price`. Auditing the unused
-- table would have produced a trail that was always empty and looked healthy.
-- A whole-table trigger on parts would fire on every description edit, so the
-- WHEN clause is what keeps this readable.
CREATE TRIGGER trg_audit_parts_money
    AFTER UPDATE ON parts
    FOR EACH ROW
    WHEN (
        OLD.default_retail_price IS DISTINCT FROM NEW.default_retail_price
        OR OLD.default_retail_currency IS DISTINCT FROM NEW.default_retail_currency
        OR OLD.hs_code_id IS DISTINCT FROM NEW.hs_code_id
        OR OLD.origin IS DISTINCT FROM NEW.origin
    )
    EXECUTE FUNCTION audit_row_change();

CREATE TRIGGER trg_audit_service_price_items
    AFTER INSERT OR UPDATE OR DELETE ON service_price_items
    FOR EACH ROW EXECUTE FUNCTION audit_row_change();

CREATE TRIGGER trg_audit_app_settings
    AFTER UPDATE ON app_settings
    FOR EACH ROW EXECUTE FUNCTION audit_row_change();

CREATE TRIGGER trg_audit_people
    AFTER INSERT OR UPDATE OR DELETE ON people
    FOR EACH ROW EXECUTE FUNCTION audit_row_change();

-- Bikes: ONLY a CORRECTION to who built it — not every bike edit, and not the
-- first stamp. `OLD.built_by IS NOT NULL` is what draws that line: the bike row
-- already records the current claim, so the log is for changes to a claim
-- already made. Without it, every finished build would write an audit row and
-- bury the four tables above in build traffic.
CREATE TRIGGER trg_audit_bike_built_by
    AFTER UPDATE ON bikes
    FOR EACH ROW
    WHEN (OLD.built_by IS DISTINCT FROM NEW.built_by AND OLD.built_by IS NOT NULL)
    EXECUTE FUNCTION audit_row_change();
