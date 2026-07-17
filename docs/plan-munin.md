# Munin — founding design (separate product, v1 "family line")

**Date:** 2026-07-17 · **Status:** agreed design, not yet built.
**This is NOT a Jensen FMS feature.** Munin is a standalone product that
*reuses FMS designs and code by copy-and-trim*. This doc lives here because
docs/ is the design home we have; it moves to Munin's own repo at scaffold
time.

## What Munin is

A phone number you talk to, that *does things*. Call or text
**+45 93 70 31 11**; if you're family (allowlisted), dictate a task —
*"send my shopping list to Nazar"*, *"put dinner with Marta in the calendar
Friday 19:00"*, *"remind Nazar to vacuum by tomorrow evening"* — hang up,
and seconds later an SMS confirms exactly what was done: *"I emailed your
shopping list to Nazar. Sent 14:32."* Every interaction is captured,
transcribed, and logged like FMS inbound. Family v1; businesses and
individuals later.

**The name.** Munin is Odin's raven, **Memory** — flew out over the world
each day, listened, returned, and whispered what it learned. You speak to
it; it remembers, acts, and reports back. Nordic, mythic, endures.
(Runners-up, recorded for posterity: Majordomo, Husk, Dictum, Bud.)
Home: **munin.valent.dk**, Vercel-hosted.

## Locked decisions (owner, 2026-07-17)

1. **Munin takes over +45 93 70 31 11.** Jensen FMS shadow-testing moves
   back to the US trial number (+1 762 500 0850, already pointed at Jensen
   prod). Dennis's company number was always the FMS production plan.
   *(Action at P1 deploy: repoint the DK number's voice/status/SMS webhooks
   to Munin; update Jensen docs.)*
2. **v1 call mode: dictate → hang up → SMS confirms.** No in-call TTS, no
   conversation (that's the v2 vision, designed-toward, not built).
   Texts are symmetric: SMS in → agent → SMS reply.
3. **Calendar = shared family Google Calendar** (Workspace service
   account/OAuth). **Reminders = native** (Munin's own table + SMS/email
   nudge at due time via cron). Email actions via **Resend** (valent.dk
   domain already verified — reuse).
4. **Languages: English + Russian** (dictation, SMS, and confirmations —
   reply in the language the message came in).
5. **Allowlist v1**: Tanya (+45 50 29 30 38, +45 55 25 30 94), Nazar
   (+45 50 36 71 11). Caller-ID gating is family-trust (spoofable — same
   honesty as FMS's shared password); unknown callers get a polite decline.
6. **Standalone everything**: own repo, own Supabase project (EU), own
   Vercel project, own env keys (same Twilio account; fresh
   Gladia/Anthropic keys recommended at go-live, shared keys OK for dev).
7. **Multi-tenant-shaped from day one, single-tenant built**: a
   `household_id` on every table (the FMS inbound-trunk trick applied to
   tenancy).
8. **MMS is out** (Twilio MMS is US/CA-only; DK numbers can't receive it).
   Photo ingress arrives later via WhatsApp on the same trunk pattern.

## Reuse map (FMS → Munin, copy-and-trim)

| FMS piece | Munin use |
|---|---|
| `telephony/twilio.ts` (signature validation, TwiML, fetch-and-delete recording) | as-is, greeting text swapped |
| Voice/status webhook routes (capture-everything, CallSid reconciliation, idempotency) | as-is + allowlist gate + new SMS webhook |
| `transcribe.ts` (Gladia adapter, confidence aggregation) | as-is, `languages: ["en","ru"]` |
| Pipeline stage pattern (stable codes, per-stage writes, failure stamping) | same skeleton; extract→match→ticket becomes **plan→execute→confirm** |
| Inbound row shape (channel-blind, `body_text`, `channel_meta`, duration/outcome, `transcript_confidence`) | near-identical table |
| Retention cron (delete audio, keep transcript) | as-is |
| Config doctrine (secrets→env; operational→settings+admin; registries in code) | as-is |
| `gate.ts` shared-password UI gate | Munin's web-log gate v1 |
| Inbox UI patterns (list + detail + stage panels) | the Munin log |

## Architecture

```
  call ──► Twilio voice webhook ──► allowlisted? ──► greeting → record
                                        │ no                │
                                        ▼                   ▼
                                  polite decline    recording callback:
                                                    audio → Supabase EU,
  SMS ──► Twilio SMS webhook ────────────────►      DELETE Twilio copy,
                                        │           row created
  every call ► status callback ► row    ▼
                                   ┌─────────── PIPELINE ───────────┐
                                   │ transcribe (Gladia en/ru)      │
                                   │ AGENT: Claude tool-use loop    │
                                   │   → executes action tools     │
                                   │ confirm: SMS back to caller    │
                                   └────────────────────────────────┘
                                        every step on the row
```

### The agent (the genuinely new 30%)

A Claude **tool-use loop** (Messages API; the model proposes tool calls,
Munin's code executes them, results go back, loop until done — then the
model composes the confirmation). Actions are **adapters behind a code
registry** (the FMS provider-registry doctrine applied to capabilities):

| v1 action tool | Executes via | Notes |
|---|---|---|
| `send_email` | Resend | subject/body composed from the dictation; default recipient = per-member config (v1: Nazar's email) |
| `create_calendar_event` | Google Calendar API | shared family calendar; title/start/end/location parsed from speech |
| `create_reminder` | native `reminders` table | due_at parsed; nudged by cron via SMS (and/or email) at due time |
| `capture_note` | fallback | when nothing else fits: email the transcript ("captured, forwarded") |

Rules: the agent **only reports what tool results confirm** (grounded
confirmation, never intent); one SMS confirmation per message, in the
message's language; on failure the SMS says what failed and the row is
stamped `failed` for the log. v1 actions are all low-risk/reversible — no
destructive tools, no purchases, no messages to third parties beyond the
family's own email.

### Schema (new Supabase project, EU)

```sql
CREATE TABLE households (              -- tenancy from day one
  id UUID PK, name TEXT, created_at
);

CREATE TABLE members (                 -- the allowlist + preferences
  id UUID PK, household_id FK,
  full_name TEXT NOT NULL,
  phones TEXT[] NOT NULL,              -- E.164; allowlist = union over members
  email TEXT,
  language CHAR(2) NOT NULL DEFAULT 'en' CHECK (language IN ('en','ru')),
  default_email_target TEXT,           -- where their "send this" lands (v1: Nazar)
  is_active BOOLEAN DEFAULT TRUE, created_at, updated_at
);

CREATE TABLE inbound_messages (        -- the FMS trunk, trimmed
  id UUID PK, household_id FK,
  channel TEXT CHECK (channel IN ('voicemail','sms')),
  from_identity TEXT, member_id FK NULL,        -- resolved via allowlist
  media_path TEXT, media_mime_type TEXT,
  body_text TEXT, language TEXT,
  transcript_confidence NUMERIC,
  duration_seconds INT, call_outcome TEXT,
  agent_plan JSONB,                    -- the tool-use trace (auditable)
  status TEXT CHECK (status IN
    ('received','understood','acted','confirmed','declined','failed')),
  confirmation_text TEXT, confirmed_at TIMESTAMPTZ,
  error TEXT, channel_meta JSONB, received_at, processed_at
);

CREATE TABLE actions (                 -- one row per executed action
  id UUID PK, household_id FK, message_id FK,
  action_type TEXT,                    -- registry key
  payload JSONB, result JSONB,
  external_ref TEXT,                   -- e.g. Google event id, Resend id
  executed_at TIMESTAMPTZ
);

CREATE TABLE reminders (
  id UUID PK, household_id FK, member_id FK,   -- who it's FOR
  text TEXT NOT NULL, due_at TIMESTAMPTZ NOT NULL,
  nudge_channel TEXT DEFAULT 'sms',
  status TEXT CHECK (status IN ('pending','nudged','done','cancelled')),
  message_id FK NULL, created_at
);

-- + household_settings (numbers, defaults), retention cron, indexes.
```

### Web surface v1 (thin, munin.valent.dk)

The **log** (Inbox pattern): every call/text with transcript, confidence,
agent plan, actions taken, confirmation sent · **reminders** list ·
**members** admin (allowlist, languages, defaults) · **settings**. Behind
the shared-password gate (`gate.ts` pattern); graduates to the
people-&-roles model (`docs/plan-people-roles.md`) if/when Munin grows
users.

## Honesty section

- **Caller-ID is the only gate** and it's spoofable — acceptable at
  family-trust, exactly like FMS's shared password. Businesses (v2) get
  real auth + per-tenant verification.
- **The agent executes on unverified voice** — v1's action set is
  deliberately harmless (email to family, family calendar, reminders). Any
  future action with real blast radius (payments, messages to outsiders,
  deletions) requires an explicit confirmation loop first — that's a
  design rule, not a TODO.
- **GDPR**: same posture as FMS — audio in EU, deleted from Twilio at
  webhook time, retention cron, transcripts kept. It's the family's own
  data in the family's own system.
- **Costs**: pennies per interaction (Twilio minutes/SMS + Gladia seconds +
  Haiku-class tokens); the number itself is the standing cost.

## v2+ (designed toward, not built)

Conversation mode (Twilio Media Streams + realtime STT/TTS, barge-in) ·
WhatsApp channel (photos! voice notes) · per-member Google auth (events in
personal calendars) · more actions (lists as living documents, home
automation, price lookups) · **productization**: households = tenants,
per-tenant numbers, signup + billing, the FMS people-&-roles model for
team accounts. The schema already carries `household_id` everywhere so
none of this is a rewrite.

## Build phases (each shippable; ~3–4 days total)

1. **Scaffold + capture** (~1 d): repo, Supabase project, Vercel project +
   subdomain; copy-trim telephony/webhooks/transcribe/retention; allowlist
   gate + polite decline; **repoint the DK number** (Jensen testing → US
   trial number; update Jensen docs). Every call/text lands as a
   transcribed, tracked row.
2. **Agent + email + SMS confirm** (~1 d): tool-use loop, `send_email` +
   `capture_note`, grounded SMS confirmations (en/ru). *First magic
   moment: dictate a shopping list, get the confirmation text.*
3. **Calendar + reminders** (~1 d): Google service account +
   `create_calendar_event`; `reminders` + nudge cron.
4. **The log UI + members admin** (~½–1 d): the web surface, password-gated.

## Open items (not blocking the doc)

- Google Workspace: create the service account + share the family calendar
  with it (owner action at P3).
- Greeting copy (en/ru) for the voice line — draft at P1.
- Fresh Gladia/Anthropic keys for the Munin project at go-live.
- Name check when productizing: trademark/domain sweep for "Munin" beyond
  munin.valent.dk.
