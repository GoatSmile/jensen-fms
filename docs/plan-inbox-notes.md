# Plan — spoken notes and the Inbox

**Status:** agreed with the owner 2026-10-07/08 in conversation; waiting for
go-ahead to build. Nothing here is built yet.

## What it is for

Finn, in the car or at a bike, needs to say something to the app and have it
**kept** — not answered. "This bike took two hours instead of one, the client
was unhappy." "Christina's new number is 21 19 77 10." "Remind me Monday to
update that record." "We need to invoice Gladsaxe." "Visit them again next
Monday." Each is first a **note** (said, at a time, by a person, possibly about
something) and then possibly an **action**. That is the same shape as a phone
call, so a note travels the call's road: transcribe → read → match → suggest →
a person (or a safe rule) applies → closed. Built for Finn; the same pipeline
serves Dennis at his desk and Glenn on the floor with different defaults.

## Decisions (owner, 2026-10-07/08)

1. **One button, a per-person mode.** The floating assistant button does what
   the person chose: *Ask* (the panel, as today) · *Note — press to start and
   stop* · *Note — one press, saves on a pause* (~2.5–3 s of silence, a beep or
   buzz at start and save, a length cap). All three built now.
2. **Act right away**, off until switched on for a person, and only for action
   kinds marked safe: attaching a note to a bike identified with certainty, and
   **calendar changes** — schedule, reschedule/move, delete an appointment —
   when the customer and date (and, to move or delete, the entry) are certain.
   Anything touching money or a contact's details is always a suggestion.
3. **Context decides "this"**, in order: what was named → the page the person
   was on when they pressed → what they just did (a call that ended ≤ 15 min
   ago) → the calendar entry happening now. If none settles it, the note asks
   ("which record?"). Never guessed.
4. **A to-do is an open note.** It carries who it is FOR — the speaker by
   default; the model may address it from what was said ("we need to invoice"
   → Dennis). A reminder is a to-do (with its day, if one was said), never a
   calendar entry. Anything with nowhere to go also stays open, as *unsorted*.
5. **The page is called Inbox** (*Indbakke*); `/inbox` becomes the route and
   `/calls` redirects to it (the reverse of 30 Sep).
6. **Layout: option 2.** Notes on top, one column per person (your own first,
   then the others; columns with nothing open are hidden behind a "+ Nazar (0)"
   chip). Calls below, as a list. Clicking an item opens a **side panel**;
   the page stays put.
7. **Who sees what is configurable per role**: `inbox` = everyone's columns and
   calls; `calls_own` (relabelled "Own inbox") = your own column and calls, plus
   notes addressed to you. Finn sees one column and his calls.
8. **Folding compresses, never hides.** Each column shows the last two days in
   full; older OPEN items collapse into one counted line ("+5 older · oldest
   12 days") that is always visible. Past 7 days an item wears its age in the
   caution hue. The calls list folds older days the same way. Unfolding lasts
   until you leave the page.
9. **Done — notes only.** One button per note (row and side panel), plus *Mark
   all done* per column with a confirmation that counts what is left unapplied,
   and one Undo for the batch. No checkboxes. **Calls keep their current
   handling** (nothing new on calls). Done never applies anything; unapplied
   suggestions are dropped and recorded on the note. Finn closes his own and
   those addressed to him; `inbox` closes in any column.
10. **A note closes itself** when every required suggestion has been applied
    and nothing is unresolved.
11. **History on the record:** the bike page and the customer page get a *Calls
    and notes* section — everything matched or attached to that record.

## Data

Migration (next number):

- `inbound_channel` gains `note` (a spoken note is a channel, like a call).
- `inbound_messages.kind` gains `note` (beside `customer`, `command`).
- `inbound_messages.addressed_to_person_id` (→ people, null = the speaker).
- `inbound_messages.note_context jsonb` — what was known at the press: route,
  entity on that page (bike/org/contact id), the person's last call id if it
  ended ≤ 15 min before, the calendar entry id covering "now", device time.
- `inbound_messages.due_date date` — a reminder's day, when one was said.
- `inbound_messages.closed_at timestamptz`, `closed_by uuid` (→ people), and
  `dropped_actions text[]` (plan action ids left unapplied at Done). Done is
  `disposition = 'handled'` plus these; Undo/Reopen clears them.
- `command_actions.applied_by` may be the SYSTEM for an auto-apply: a nullable
  `auto_applied boolean` records it.
- `people.assistant_mode` (`ask | note_toggle | note_vad`, default `ask`) —
  chosen by the person; `people.assistant_auto_apply boolean` default false —
  set on the person page by whoever administers people. (A column rather than
  `ui_preferences`, because the server must read it in a background job.)
- Capability label only: `calls_own` → "Own inbox" (key unchanged).

## Actions

New plan action kinds (beside `draft_event`, `draft_ticket`, `draft_offer` …):

| Kind | Does | Auto-apply when |
|---|---|---|
| `attach_note` | links the note to a bike / customer / contact (sets the matched ids; it then shows in that record's history) | exactly one bike (or record) resolved |
| `update_contact` | proposes phone/email old → new on a contact | never |
| `move_event` | moves an existing calendar entry | the entry and the new time are certain |
| `delete_event` | removes a calendar entry | the entry is certain |
| `draft_event` (exists) | schedules a visit/delivery | customer and date certain |

- `CalendarAdapter` gains `updateEvent` + `deleteEvent` (BACKLOG item; the
  service account's scope already allows them). Both go through
  `src/lib/calendar/entries.ts`, never a second writer.
- A new `AUTO_APPLY_SAFE` map beside `ACTION_CAPABILITIES`: the kind's rule,
  checked again at apply. Auto-apply runs in the background planner pass, only
  for a speaker with `assistant_auto_apply`, and writes the same ledger row.
- Each new kind joins `ACTION_CAPABILITIES`/`mayApply`, the result-with-link
  rule (`command_actions.payload`), and the model Test (CLAUDE.md: a new
  Anthropic shape joins the Test).

## Pipeline

1. **Capture** (client). The button, by mode: `note_toggle` records until the
   second press; `note_vad` starts at once and stops on ~2.5–3 s of silence
   (energy threshold over the Web Audio stream already in `use-recorder.ts`;
   length cap = `MAX_RECORD_SECONDS`), beeps (Web Audio) and vibrates at start
   and save. Sends the WAV by the existing signed upload, plus the context.
2. **Save** (server action). Inserts the `note` row at once — the person sees
   "Saved" — then transcribes (the dictation provider + names list). The audio
   is kept under the inbound retention, not deleted like a dictation, so a
   failed transcription can be retried (dictation rule: keep the recording).
3. **Read and plan** (the 5-minute job, or immediately after save): extract →
   match → plan with the note prompt (facts, edits, to-dos, calendar) and the
   context; set `addressed_to_person_id`, `due_date`.
4. **Auto-apply** the safe actions if the speaker allows it.
5. **Close** when nothing required is left (decision 10).
6. A note right after a call ("the call I just had was about bike X"): the
   planner may attach to `note_context.last_call_id` — the bike goes on the
   CALL, and the note closes as attached.

## Screens

- **`/inbox`** (route + nav item renamed; `/calls` redirects): notes columns,
  then calls; side panel for one item (reuses the call detail body + the plan
  panel); fold and age rules; *Done* and *Mark all done* on notes. Phone
  width: one column at a time with the person switcher on top.
- **Bike page and customer page:** *Calls and notes* section (matched or
  attached rows, newest first, link to the item).
- **The button** (`AssistantButton`): reads `assistant_mode`; the panel keeps
  *Send*, and gains *Save as note* for anyone.
- **Settings:** the mode in the person's own settings; *Act right away* on the
  person page (people admin).

## Order of work

1. Migration + note capture + the three button modes + save/transcribe; notes
   show in today's `/calls` page as a channel (smallest visible slice).
2. The Inbox layout (columns, fold, side panel, Done / Mark all done / Undo,
   auto-close), rename and redirect, visibility per role.
3. `attach_note`, `update_contact`, the planner's note prompt, history
   sections on bike and customer pages.
4. Calendar `updateEvent`/`deleteEvent`, `move_event`/`delete_event`,
   auto-apply with the person switch.
5. Test on Finn's Android in the car (web app on the car screen is untested —
   see Risks), then the guide for Finn (PDF).

Rough size: slices 1–2 ~1 day each, 3 ~1 day, 4 ~half a day, 5 with Finn.

## Files (expected)

- `migrations/1NN_inbox_notes.sql`
- `src/lib/dictation/use-recorder.ts` (silence detection, beeps),
  `src/components/assistant-button.tsx`, `src/components/assistant-panel.tsx`
- `src/app/inbox/**` (page, side panel, actions: save note, done, mark all,
  undo/reopen) — the current `src/app/calls/**` moves here; `/calls` redirects
- `src/lib/calls/{load,triage,access}.ts` → note rows, columns, fold, scope
- `src/lib/inbound/command/{plan,agent,plan-calls}.ts` + a note prompt;
  `src/lib/assistant/agent.ts` (`ACTION_CAPABILITIES`, `AUTO_APPLY_SAFE`)
- `src/app/calls/_actions/command.ts` (`performAction` for the new kinds)
- `src/lib/calendar/{client,google,entries}.ts` (update + delete)
- `src/app/bikes/[id]/…`, `src/app/organizations/[id]/…` (history section)
- `src/lib/people/{capabilities,routes}.ts`, `src/components/nav-items.ts`
- `messages/{en,da}.json`; CLAUDE.md (inbound + assistant rules), DECISIONS.

## Risks and unknowns

- **Recording in the car.** A web app records only while open on screen; it
  cannot record with the phone locked. Whether Android Auto shows a web app at
  all is unverified — test before promising Finn anything.
- **Silence detection in a car** (engine, road noise): the threshold must be
  tuned on his phone; the press-to-stop mode is the fallback.
- **The calendar is shared**, not per person, so "the entry happening now" is
  any entry in *Servicebesøg* at that time — fine while Finn is the only one
  on visits; a person field on entries comes later if it bites.
- **Auto-apply mistakes** on calendar entries are visible to everyone; every
  auto-applied action shows on the note with its result and is undoable from
  there.
