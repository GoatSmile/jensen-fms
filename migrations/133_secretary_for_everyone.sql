-- 133 · Everyone presses for the SECRETARY
--
-- Owner, 2026-10-21: default everyone to "The secretary: speak, and hear the
-- answer". Migration 130 made `ask_voice` the column default and moved the
-- note modes over, but left whoever was on `ask` (open the panel to type)
-- where they were. This moves them too. The other modes stay as choices in
-- the panel; a person may pick one again afterwards.

UPDATE people SET assistant_mode = 'ask_voice' WHERE assistant_mode <> 'ask_voice';

insert into public.schema_migrations (version, name)
  values (133, '133_secretary_for_everyone') on conflict (version) do nothing;
