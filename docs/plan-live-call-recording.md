# Live call recording — bridged calls on the inbound trunk

**Date:** 2026-07-23 · **Status:** V1 BUILT + **LIVE-CALL VERIFIED 2026-07-25**
(flag-gated; ships default off). First real bridged call: customer phone →
Twilio → notice → rang the test mobile → 102 s conversation recorded in dual
channel → EU storage, Twilio copy deleted → transcript → extraction → customer
org auto-matched by phone, 27 s from hangup to `matched`. Findings below.
Today a customer calling the Twilio number reaches a voicemail. This adds the
other half: the call **rings a real phone** (test number now, Dennis's number
later), the **conversation** is recorded, and it lands in the same Inbox
review queue as a voicemail — transcribed, matched, ready to become a ticket.

*Dennis: the prose is for both of us; the `code blocks` are developer
blueprints — skip them freely.*

## The constraint that decides the shape

To record an **answered** call, the call must pass *through* Twilio while you
are on it. That kills the original "overflow" idea:

| Deployment | Answered calls recorded? |
|---|---|
| **Front door** — the Twilio number is the published workshop number; Twilio rings your mobile and bridges | ✅ yes |
| **Overflow** — your own number stays public, forwarding to Twilio only on busy/no-answer | ❌ no — answered calls never touch Twilio |

So live-call recording ⇒ **the Twilio number is the front door**, and the
number printed on documents eventually becomes it. Until then the switch below
lets us run front-door behaviour on the test number without touching anything
else. (This was the open August question in `docs/plan-inbound-triage.md`.)

## The switch (owner-facing)

Admin → Settings → **Calls & inbound** gains a call-handling mode:

- **Voicemail** (default, = today) — announce, record a message, hang up.
- **Ring a phone, then voicemail** — announce, ring `inbound_bridge_number`
  for N seconds; if answered, record the conversation; if not, fall through to
  the existing voicemail. **Voicemail is the fallback, never skipped.**

Config is operational (tier 2, `app_settings`), no new secrets:

```
inbound_call_mode                    'voicemail' | 'bridge'   (default 'voicemail')
inbound_bridge_number                E.164 — the phone to ring (test → Dennis)
inbound_bridge_timeout_seconds       ring time before voicemail (default 20)
inbound_call_transcription_provider  which adapter transcribes CONVERSATIONS
```

`workshop_phone` is deliberately NOT reused: migration 55 documents it as the
number *printed on outbound documents*. The ring target is a different fact
(a mobile that changes hands), so it gets its own column.

## Call flow

```
customer dials the Twilio number
        │
   /api/inbound/twilio/voice        mode='bridge'?
        │                                 │
        │ mode='voicemail'                ▼
        │                    bilingual "this call is recorded" notice
        │                                 │
        │                    <Dial record="record-from-answer-dual"
        │                          answerOnBridge timeout=N
        │                          action=/dial-status>
        │                                 │
        │                    ┌────────────┴─────────────┐
        │                 ANSWERED                  no-answer/busy/failed
        │                    │                          │
        │            conversation recorded         /api/inbound/twilio/dial-status
        │            (ch1 = customer, ch2 = us)     returns the SAME voicemail TwiML
        │                    │                          │
        └────────────────────┴──────────────┬───────────┘
                                            ▼
                        /api/inbound/twilio/recording  (unchanged contract)
                        audio → Supabase EU · Twilio copy DELETED
                                            ▼
                        transcribe → extract → match → review in /inbox
```

Everything below the recording callback is **already built and live** — the
trunk, EU-storage-and-delete, CallSid reconciliation, matcher, review surface,
90-day retention cron. That's why this is a small slice, not a new pipeline.

## The interesting problem: who said what

A voicemail is a monologue — one speaker, no attribution needed. A conversation
is a dialogue, and "the customer asked for X" vs "we promised X" are entirely
different facts. Getting that wrong is worse than having no transcript.

**The good news:** Twilio's `record-from-answer-dual` is a *contract* — "the
parent call will always be in the first channel and the child call will always
be in the second". So **channel 1 IS the customer and channel 2 IS us, as a
fact, not a guess.** That fits this codebase's standing rule (matching is
deterministic code, never the model). Exploiting it depends on the provider:

| Option | Attribution | Residency | Status |
|---|---|---|---|
| **Gladia automatic multi-channel** — read `utterance.channel` | **Deterministic** — the channel IS the speaker | **EU-native** (the 2026-07-15 reason we chose it) | ✅ **SHIPPED — no new vendor, no key, no migration** |
| **Azure** `channels:[0,1]` | Deterministic | US-parented, EU region + DPA | adapter built + seam in place; needs `AZURE_SPEECH_KEY`. Held as a fallback |
| **Gladia diarization** `number_of_speakers:2` | Probabilistic — and measurably bad here (see below) | EU-native | kept only as the mono fallback |
| Split the stereo ourselves → 2 mono files | Deterministic | EU-native | unnecessary — superseded by the above |

### ⚠️ Correction, 2026-07-25 — the first reading was WRONG

An earlier pass concluded "Gladia has no per-channel option, diarization only",
from the init endpoint's parameter schema. **That was wrong**, and it nearly
bought us a needless migration to Azure. Gladia's docs
(`limits-and-specifications/multiple-channels`) state that multi-channel audio
is transcribed **automatically** — no parameter to enable — and **every
utterance carries a `channel` key**. Billing note: two channels with different
content bill as two audios (pennies at this volume).

**Confirmed empirically against our own recorded call** (re-transcribed the
stored dual-channel MP3 with diarization OFF):

```
utterance keys: text, language, start, end, confidence, channel, words
distinct channel values: 0, 1        ← exactly two, deterministic
distinct speaker values: (none)      ← no diarization requested, none needed
```

Channel 0 held the entire customer side, channel 1 our side — matching Twilio's
documented contract (parent call first, dialed party second). So the
deterministic attribution **was already in the response and our code was
discarding it**: we asked for diarization and read `utterance.speaker` when we
should have read `utterance.channel`. That single mistake produced the
four-speakers-for-two-people artifact.

**Before → after on the same audio:** `Speaker 1 … Speaker 4` (one a pure
artifact) → `Customer:` / `Workshop:`, correct throughout, with
`speakers_inferred = false`. Background noise on our side is now correctly
attributed to our channel instead of being invented as an extra person, and the
extraction prompt is told the labels are reliable rather than warned they may be
swapped.

**Decision: stay on Gladia.** EU-native, already integrated, already paid for,
and now deterministic. Azure remains a built-and-ready fallback if Danish
accuracy on real calls ever disappoints — that is now the *only* open reason to
switch, and it is a measurement, not an architecture question.

### Measured on the first real bridged call (2026-07-25)

A 102-second two-person call, Gladia with `number_of_speakers: 2`:

- Transcript quality was **good** — clarity 0.80 (vs 0.51 on the earlier
  garbled voicemail), content fully intelligible, extraction got everything
  (SDG · 10 white electric bikes · flower basket · logo · order_inquiry).
- **Diarization invented FOUR speakers** ("Speaker 1" … "Speaker 4") for two
  people, despite the exact-count hint. One label was pure artifact, and the
  customer's substantive request landed under a *different* label than their
  opening line. → **Root-caused and fixed the same day**: we were reading the
  diarization guess instead of the channel tag. See the correction above.

Lesson worth keeping: **diarization is not good enough to trust for
attribution, even with an exact speaker-count hint** — so never use it where a
channel tag is available. It didn't damage this call, because the extraction
prompt was told labels were unreliable and reasoned from content instead, and
`commitments` correctly came back EMPTY rather than inventing a promise the
workshop never made. That defensive design is why a provider bug degraded to
"slightly odd transcript" rather than "wrong facts in the CRM".

Still untested: **Danish** on the bridged path. This call was in English, and
our only Danish samples are mono voicemails that scored 0.51 and 0.26 clarity.
One Danish bridged test call is the outstanding validation — and it is the only
evidence that should drive any future provider change.

**The residency tension is real and is the owner's call**, not a dev default:
conversation audio is more sensitive than a voicemail someone chose to leave.
Deterministic attribution (Azure, EU region + DPA) vs EU-native processing
(Gladia) — pick when accuracy on real Danish calls is measurable. Option 3
(self-split) gets both and is the honest long-term answer if it matters.

## Extraction: a dialogue is not a message

`extract.ts`'s prompt says *"facts from a message left for a workshop"* and its
fields are caller / problem / urgency — a monologue shape. A conversation's
valuable residue is different: **what was agreed.** So the live-call path gets
a dialogue prompt variant and two optional fields:

```
callSummary   string|null    2-3 sentences: what the call was about + outcome
commitments   string[]       what WE promised ("delivery Tuesday", "quote 2500 kr")
```

Both null/empty for voicemail, so the shared `InboundExtraction` contract and
`parseExtraction` backstop stay one shape. The prompt is explicitly warned that
speaker labels are inferred and that the workshop side usually greets first.

## Two real gotchas found in the existing code

1. **An answered call could have been spam-folded.** `status/route.ts` maps
   Twilio's `completed` → `no_message` and runs `applyTriage`; a conversation
   from an unknown number would score `unknown_number` + `no_message` and land
   in the collapsed spam fold. Fixed: bridged/answered calls get
   `call_outcome='answered'` and skip spam scoring — a call a human answered is
   by definition not a robocall.
2. **The media cap was sized for voicemails.** The `inbound` bucket's
   `file_size_limit` is 25 MB ("≈ a very long voicemail"). A dual-channel
   20-minute conversation can exceed that and the upload would fail silently
   (the row stores with an error, no audio). Raised to 100 MB.

Also noted, not yet fixed: `GLADIA_POLL_TIMEOUT_MS` (90 s) and the recording
route's `maxDuration = 60` were sized for 2-minute voicemails. A long call may
outrun both — it degrades gracefully (the row lands; the reviewer hits "Run
whole pipeline"), but the right fix is Gladia's **async `callback`** (verified
supported: `callback: true` + `callback_config.url`) instead of in-function
polling. That's the follow-up, deliberately not in V1.

## GDPR

- **Pre-bridge announcement**, bilingual, before the phone rings — the caller
  is told the call is recorded while they can still hang up.
- Recording a two-way conversation is a bigger step than transcribing a
  voicemail. DK is one-party-consent for a participant, but GDPR still needs
  notice + basis + retention. Notice ✅ (above), retention ✅ (existing 90-day
  cron works on `media_path`, unchanged), **privacy-policy line + telling
  staff = owner action.**
- Audio still lands in Supabase EU and the Twilio copy is deleted at webhook
  time — unchanged.

## Cost delta

Two legs instead of one (inbound + the outbound leg to the mobile) plus
recording, and transcription scales with call length rather than a 2-minute
cap. Still pennies per call; Gladia is ~$0.20/hr.

## What V1 does not do

No auto-created tickets (shadow mode unchanged — every call is reviewed) · no
outbound calling from the app · no IVR menu / business-hours routing · no
"press 1 to decline recording" · no live transcription during the call · no
Dennis-side whisper announcement (he's informed by policy, not by robot).

## Follow-ups

- Gladia async `callback` to kill the long-call polling ceiling.
- Deterministic attribution: `AZURE_SPEECH_KEY` + flip the call-path provider,
  or build the self-split path to keep EU-native.
- Business-hours / out-of-hours routing straight to voicemail.
- The front-door cutover itself: publishing the Twilio number, porting or
  forwarding the shop's real number (August, with Dennis).
