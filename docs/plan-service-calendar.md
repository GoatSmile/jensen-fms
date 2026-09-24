# Service calendar — the service technician's appointments in Google Calendar

**Date:** 2026-09-24 · **Status:** DESIGNED, not built. Decisions in
`docs/DECISIONS.md` (2026-09-24). Agreed with Dennis on the 24 Sep call: *a free
Google Calendar for Finn, on his service email address.*

## What it is for

The system puts service visits into one shared Google calendar; the service
technician (Finn today) moves and edits them there as the day demands; the whole
team can see it. When a customer phones to move a visit, the system proposes the
change and a technician approves it. **Internal only** — nothing is ever sent to
customers from or about this calendar; the technician talks to customers himself.

**Not an appointment module.** Google is where the times live. The system keeps
only a thin link — which ticket / work order belongs to which Google event — plus
a queue of pending suggestions. Building our own calendar was considered and
rejected as overkill (DECISIONS 2026-09-24).

## Account and naming

- **Google account:** `service@jensenproduction.dk` — the service function's
  mailbox, not Finn's person. A **free** Google account created on that existing
  address (its mail stays at one.com; no Gmail). **Confirm the exact address with
  Dennis** — the meeting notes say `service@yensen.dk`, which has no mail server
  and is almost certainly a mis-transcription.
- **Calendar:** one calendar in that account, **"Servicebesøg"**.
- **Password + recovery phone in Jensen's hands**, not Finn's or the developer's
  (same account-ownership question as Twilio).

## Flow

```
ticket / work order ──► system BOOKS the visit directly ─────────────┐
                                                                     ▼
call: "can we move it?" ──► SUGGESTION ──► approval list ──► Google "Servicebesøg"
                                            (any workshop user)      ▲
Finn edits directly in Google ───────────────────────────────────────┘ (no approval)
                                                                     │
               Google push notification ──► system re-reads the event ──► ticket shows current time
```

- **A plain booking from a ticket is written straight to Google** — no approval.
- **What the system infers from a call is a suggestion** (move / cancel / new
  visit). It waits on an approval list until a technician approves or rejects it;
  only then is Google written. The system never changes the calendar on its own
  from a call.
- **Suggestions are checked against Google's current version of the event at
  approval.** If the event changed in Google after the suggestion was made, it
  is marked *stale* rather than overwriting the technician's edit.
- **Edits made directly in Google need no approval** — the technician is the
  authority; the system just syncs them back.
- **Who approves = every workshop user.** A capability on the existing
  **Workshop** role (e.g. `service_calendar`, registered in `src/lib/people/`),
  not a new role and not a named person; notification of a waiting suggestion
  goes to that role via `role_notifications`.
- **Call → suggestion** is one new extraction intent (`reschedule_request`) on the
  inbound trunk, matched to the existing visit through the org/bike/ticket.
  Deterministic matching, same rule as the rest of the trunk: attach only when
  exactly one open visit survives, otherwise hand the technician the candidates.

## Viewing

- **For now: an "Open calendar" link** (nav + admin page) that opens the calendar
  in Google. Showing it inside the app is later.
- **Team members each need a Google account** (free is fine); the calendar is
  shared with each — edit for workshop users, view for the rest.
- **Never make it public.** Events carry customer names and addresses.
- "Instant": system writes and Finn's edits appear for shared viewers within
  seconds; Google's phone app can lag a minute.

## Minimal personal data in events

Title = customer + bike (frame/fleet number) + short problem; description = a
link to the ticket. **No phone numbers, no contact person names** — those stay in
our system. This is what makes the free account defensible (below).

## Free vs paid Google

| | Free | Why it's fine / what bites |
|---|---|---|
| Calendar API, push notifications, sharing | ✅ | quotas far above one calendar's needs |
| System access | ✅ via a **service account** the calendar is shared with | NOT OAuth-as-the-user: a consent screen left in "testing" expires the token every 7 days |
| Sending Google invitations to attendees | ❌ needs Workspace (domain-wide delegation) | irrelevant — no customer communication |
| **Data-processing agreement (DPA)** | ❌ Workspace only | **the real gap**: events hold customer data; hospitals/municipalities ask. Mitigated by minimal personal data |
| Company-owned account, admin console, support | ❌ | owned by whoever holds password + recovery phone |

**Paid Google Workspace (Business Starter, ≈ €7/user/month — verify) buys:** the
DPA, a company-owned account, attendee invitations, resource calendars, support.
It does not require moving mail off one.com. **Start free; switch when a customer
asks about the DPA.** The switch is cheap because the calendar id lives in
settings.

## Config (three-tier doctrine)

- Service-account key → env / Vercel (secret; admin card shows present/missing).
- Calendar id, provider selection → `app_settings` + `/admin/settings`.
- Calendar is a swappable capability → registry entry (`google` first), per the
  provider pattern.

## Build slices

| Slice | Estimate |
|---|---|
| 0 · Setup — account, calendar, service account, sharing, "Open calendar" link | ~60 human-dev-min (+ Google waits) |
| 1 · Book a visit from a ticket / WO → Google event; ticket ↔ event link | ~0.5 day |
| 2 · Sync back — push-notification webhook + incremental sync + daily channel renewal | ~1 day |
| 3 · Suggestions queue + Workshop capability + notification + apply-on-approve with stale check | ~1–1.5 days |
| 4 · Call → `reschedule_request` suggestion | ~1 day |

## Open

- Confirm the service email address (above).
- Who holds the account password and recovery phone.
