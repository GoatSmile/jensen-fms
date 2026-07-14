-- ============================================================================
-- 66 — Inbound pipeline provider settings (config-vs-secrets doctrine)
-- ============================================================================
-- Provider SELECTION + operational params for the inbound pipeline live in
-- app_settings (admin-editable at /admin/settings); only the provider API
-- KEYS live in env vars. This is the standing three-tier config doctrine:
--   secrets → env only  ·  operational config → app_settings + admin  ·
--   vocabulary → controlled-vocab tables.
--
-- Switching a provider in admin picks among ADAPTERS THAT EXIST in code (each
-- provider is an adapter behind a stable interface); config selects which
-- adapter runs and holds its non-secret params (region, model, phone number).
-- The admin card shows a live present/missing check for the selected
-- provider's required env secret — never the value.
--
-- Defaults match the locked provider verdicts (Azure Speech EU / Claude Haiku
-- / Twilio). Region + model are config so they can change without a deploy.

ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS inbound_transcription_provider TEXT NOT NULL DEFAULT 'azure',
  ADD COLUMN IF NOT EXISTS inbound_transcription_region   TEXT,
  ADD COLUMN IF NOT EXISTS inbound_extraction_provider    TEXT NOT NULL DEFAULT 'anthropic',
  ADD COLUMN IF NOT EXISTS inbound_extraction_model       TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
  ADD COLUMN IF NOT EXISTS inbound_telephony_provider     TEXT NOT NULL DEFAULT 'twilio',
  ADD COLUMN IF NOT EXISTS inbound_phone_number           TEXT,
  ADD COLUMN IF NOT EXISTS inbound_media_retention_days   INTEGER NOT NULL DEFAULT 90,
  -- v1 is shadow mode: the pipeline drafts a ticket for review, nothing
  -- auto-sends to customers. Flipping this off is a later go-live switch.
  ADD COLUMN IF NOT EXISTS inbound_shadow_mode            BOOLEAN NOT NULL DEFAULT TRUE;
