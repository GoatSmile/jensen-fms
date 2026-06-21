-- Working-language preferences on the app_settings singleton.
--
-- app_language    — the language the office/admin UI should use.
-- worker_language — the language for build/workshop-floor + ticket screens.
--
-- Both default to English. For now these only capture the preference (the UI
-- itself is not yet translated); later the worker language becomes per-user.
ALTER TABLE app_settings
  ADD COLUMN app_language TEXT NOT NULL DEFAULT 'en'
    CHECK (app_language IN ('en', 'da')),
  ADD COLUMN worker_language TEXT NOT NULL DEFAULT 'en'
    CHECK (worker_language IN ('en', 'da'));
