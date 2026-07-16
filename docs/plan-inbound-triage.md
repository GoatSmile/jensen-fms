# Inbound triage & routing — design reference

**Date:** 2026-07-16 · **Status:** agreed design, implementation deferred
(pick up with Dennis in August, after shadow-mode data accumulates).
Companion to `docs/plan-july9-vacation-month.md` (which covers the shipped
pipeline slices A–F); this doc is the *next* arc: capture-everything,
confidence, triage, routing, and the graduation path out of shadow mode.

## Where this starts from

As of 2026-07-16 the inbound pipeline is **live in production**: a real
Danish number (+45 9370 3111, dev account; Dennis's company number comes
later) → Twilio voice webhook → bilingual recorded-call notice → voicemail →
recording pulled to Supabase EU + deleted from Twilio → Gladia transcript →
Claude extraction (incl. `intent`) → deterministic matcher → shadow-mode
draft ticket in `/inbox`. First two real calls both processed correctly,
including distinct intents (`repair_request` vs `order_inquiry`).

The foundational decision already made — and to be preserved — is **one
table, one channel-blind pipeline** (`inbound_messages`). Spam, garbled
audio, hang-ups, and future SMS/WhatsApp are all rows with different
channels/dispositions, never parallel systems.

## The five-layer model

```
1. CAPTURE     every contact event, even contentless ones     (partially built)
2. UNDERSTAND  audio → text, with a clarity score             (built; no score yet)
3. INTERPRET   text → structured facts, per-field confidence  (built; no confidence yet)
4. IDENTIFY    facts → who is this, with provenance           (built — `via` provenance exists)
5. TRIAGE      everything → ordered queue + disposition       (new layer)
```

## Design principles

1. **Record events, not just messages.** Every call attempt produces a row —
   a hang-up at the greeting is signal (robocallers hang up at greetings;
   a customer who hung up twice before leaving a message is frustrated).
2. **Confidence is per-stage and explainable — never one blended score.**
   Transcript clarity, extraction confidence, and match provenance are
   three separate facts; the UI surfaces the weakest link ("clear audio ·
   org identified by name only · no callback number heard").
3. **Prefer calibratable signals over model self-reports.** Gladia's
   acoustic confidence and deterministic match provenance are real;
   LLM self-confidence is weakly calibrated → ordinal high/medium/low
   only, cross-checked by structural validation (does the callback number
   parse, does the frame number match our format).
4. **The model proposes, code disposes** (the matcher doctrine, extended
   to triage): spam scoring is explainable signals stored per-row, the
   model's `intent=spam` is just one signal among them.
5. **Triage is queue ordering, not a gate.** Nothing is discarded; spam is
   *parked* in a collapsed fold, reversible. Auto-actions arrive only
   after shadow-mode calibration proves the rates.
6. **Business-context-aware priority is the moat.** Generic call tools rank
   by recency; the FMS knows the caller's org has 40 bikes under an active
   agreement and two open tickets. Queue order = urgency × who's calling
   (agreement customer > known > unknown > suspected spam) × clarity.
7. **Every human review should teach the system** — with zero ML (see the
   learning loop below).
8. **Scale honesty.** Dozens of calls/week, not thousands/day. Stateless
   webhooks + one table already scale; complexity (ML classifiers,
   materialized reputation stores, streaming) is deliberately not bought.

## Layer detail

### 1 · Capture everything

- Wire Twilio's **call-status callback** (the currently-empty "Call status
  changes" field) → a row for every call attempt, including
  `body_text: null` + `channel_meta.call_outcome: "hung_up_before_message"`,
  with duration. Idempotent on CallSid.
- Promote buried metadata to first-class queryable columns on
  `inbound_messages`: `duration_seconds int`, `intent text` (denormalized
  copy of `extraction->>'intent'`). `from_identity` + `received_at` already
  capture number/time regardless of whether the caller is in the DB.

### 2–3 · Confidence plumbing

- `transcript_confidence numeric` — aggregated from Gladia's per-utterance
  scores. Low → "garbled" badge, review priority, and (registry payoff)
  **second-opinion re-transcription** via the other registered provider
  (Azure), showing both when they disagree.
- Extraction: per-field `high|medium|low` in the extraction payload +
  structural checks in code. No percentages.
- Match: keep `via` provenance as the confidence tiers
  (phone-exact > frame-exact > org-name-unique > fleet+hint).

### 5 · Triage

- New fields: `disposition enum (pending | spam | no_action | actioned)` +
  `spam_signals jsonb` (each signal stored so the reviewer sees *why*).
- Spam signals (boring, explainable): near-zero duration ·
  hang-up-at-greeting · repeated identical-length calls from an unknown
  number · extraction `intent=spam` · **trump card: a number that ever
  matched a contact is never spam**.
- Inbox becomes an ordered queue (principle 6) with a collapsed spam fold.
- **The learning loop:** when a reviewer links an unknown number to a
  contact, offer "save this number to the contact" → future calls from
  that number auto-match at the highest tier. Every review permanently
  improves matching. Highest-leverage feature in this doc.

### Routing (the order_inquiry problem)

First production call of intent `order_inquiry` exposed it: Slice E always
drafts a *maintenance* ticket — wrong destination for an order.

- Intent taxonomy stays small: `repair_request → maintenance ticket`
  (built) · `order_inquiry → sales lead` · `complaint → ticket, high
  priority` · `supplier/other → disposition only` · `spam → park`.
- Honest dependency: a lead's proper home is the offers/quotes module
  (Tier 5, deferred). **Interim: the inbox IS the lead tracker** —
  disposition + matched org + callback number is literally a lead.
- Schema: the original design said "no polymorphic action framework until
  a second action type is real" — order routing is that second type. When
  built: a sibling nullable FK next to `ticket_id` (promote to an actions
  table only at 3+ types).

### v2 and future channels (context, designed elsewhere)

- **v2 live-answer:** voice webhook returns *announcement → Dial employee
  (dual-channel recorded) → no-answer → voicemail (current build = the
  permanent fallback)*. `app_settings.workshop_phone` reserved for it.
  Deployment choice is Dennis's: overflow-only (his number forwards
  missed calls) vs front-door (Twilio number rings his phone, every call
  captured). ~1 day of code once decided.
- **SMS / WhatsApp:** thin adapters on the same trunk (SMS skips
  transcription entirely; WhatsApp voice notes reuse it; photos become
  attachments). Real cost is provider onboarding (A2P registration;
  Meta business verification — weeks, start early). The
  threading/conversation model is designed **when the first two-way
  channel lands**, not before.
- **QR synergy:** bike QR stickers → "call/text us about *this bike*" →
  inbound arrives pre-matched to the bike.

## Deliberately NOT building

No ML spam classifier (signals + human suffice at this volume) · no
auto-actions until measured · no real-time streaming transcription · no
materialized caller-reputation table (derive per-number history by query —
same philosophy as "current stock is a query"; materialize only if volume
demands).

## Phasing

1. **Capture-everything** — status callback + promoted columns
   (`duration_seconds`, `intent`, `call_outcome`). One migration.
2. **Confidence plumbing** — transcript_confidence + per-field ordinals +
   garbled badge + second-opinion re-transcribe.
3. **Triage v1** — disposition + spam fold + spam_signals + queue ordering.
4. **Routing v1** — intent → action choice on the review screen (ticket /
   lead-disposition / park). Auto-creation stays off.
5. **Stats fold** — weekly match rate, intent accuracy, garble rate, spam
   share. Shadow mode is the calibration set, not a waiting room.
6. **Graduation criteria** — defined FROM the stats (e.g. "≥90% correct org
   attachment, ≤5% intent misses over 50 real calls"); leaving shadow mode
   becomes a measurement, not a leap of faith.

## Open questions for the August session (Dennis)

- Overflow vs front-door deployment for v2 (his phone, his workflow).
- His company production number (regulatory bundle with company docs).
- Lead handling: is inbox-as-lead-tracker enough until offers/quotes, or
  does a minimal leads surface come forward?
- Intent taxonomy review against real call mix after a few shadow weeks.
- SMS ack go-live (GatewayAPI) once out of shadow mode.
