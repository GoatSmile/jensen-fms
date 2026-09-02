# Voice commands — design reference

**Date:** 2026-07-17 · **Status:** **VC-1 SHIPPED 2026-07-23** (Option A,
text-first — the in-app dictate slice; commits `1799d61`, `a403b12`).
Phone/audio ingress and the staff-number fork are **VC-3**, deferred and
unscheduled (the August session did not happen); this doc stays live for that arc. Narrative in
`docs/archive/HISTORY.md`, mechanics in `docs/DECISIONS.md` (2026-07-23).

Staff dictate business tasks — by calling the workshop number or via an
in-app dictate button — and the system drafts the corresponding actions
for review. *"Just got an order for 15 bikes from Hotel D'Angleterre,
delivery March 15th, red, front weave basket, bright white logo"* →
offered customer creation + a draft SO with the production note filled in.

**The core recognition:** this is the Munin pattern (dictate → tool-use
agent → act → grounded confirmation, see `~/workspace/code/munin`)
pointed at business objects, riding the FMS inbound trunk that is already
live in production — and **FMS already has all the verbs**. Draft POs with
landed-cost snapshots (`src/lib/purchasing/draft-pos.ts`), SO/customer/
ticket creation, slating, production notes: every proposed action wraps an
EXISTING server action. The agent is a new caller of existing verbs, not
new machinery.

## Design rules (non-negotiable)

1. **The model proposes, code disposes** — the agent produces a *plan* of
   proposed actions; deterministic code + a human apply them.
2. **Never guess-create** — an unresolvable reference ("which template?")
   becomes an OPEN SLOT in the plan for the reviewer to fill, never an
   invented record.
3. **Everything lands as a draft** — FMS draft statuses are the native
   safety net (editable, deletable, no numbers burned). Applied entities
   carry a provenance banner ("drafted from a voice command — review"),
   like the phone-ticket banner.
4. **Grounded confirmations** — the reply (SMS / inline) reports only what
   tool results confirm, plus what still needs a human.
5. **Review-first, graduation later** — same shadow-mode philosophy as the
   inbound pipeline: auto-apply per action type is earned with measured
   accuracy, never assumed.

## Pipeline

```
 staff calls the workshop number          in-app "Dictate a command"
 (From ∈ people.phones → command fork,    (MediaRecorder → same upload
  distinct greeting: just a beep)          ingress the harness uses)
        │                                        │
        └────────────► inbound trunk ◄───────────┘
                    (capture, EU storage, tracking — live today)
                            │
                    transcribe (Gladia — live today)
                            │
                    COMMAND AGENT (Claude tool-use loop)
                    1. read-only RESOLVERS ground every reference
                    2. propose DRAFT ACTIONS (+ open slots)
                            │
                    plan stored on the row → REVIEW in Inbox
                    (chips for resolved entities, pickers for open
                     slots, Apply per action / apply all)
                            │
                    Apply → existing server actions create the drafts
                            │
                    grounded confirmation (SMS back / inline)
```

- Same `inbound_messages` trunk: new `kind` column
  (`'customer'` default | `'command'`), forked by staff-number match at
  the webhook. Customer processing unchanged.
- One transcription pipeline for phone AND in-app (MediaRecorder →
  Gladia), deliberately NOT the browser speech API — phone parity, da
  quality, one code path. (The floor `DictateButton` stays as-is for
  note-taking; commands use the trunk.)
- SMS commands from staff numbers: nearly free once this exists.

## Worked example (the founding utterance)

*"This is a call from Nazar. Just got an order for 15 bikes from Hotel
D'Angleterre. Delivery March 15th. Red, front weave basket, bright white
logo."*

| Agent step | Result |
|---|---|
| `search_customer("Hotel D'Angleterre")` | not found → propose **create customer**, segment `Hotel` (existing vocab) |
| `resolve_color("red")` | ✅ seeded colours |
| `search_part("front weave basket")` | maybe a basket SKU, else stays text |
| which bike model? | never said → **open slot** on the SO line |
| date "March 15th" | exact-date delivery (`requested_delivery_precision` exists) |
| "front weave basket · bright white logo" | → `sales_orders.production_note` (already flows to the build floor) |

Plan: ① create customer (offered) · ② draft SO: 15 × [template: OPEN],
red, delivery 15 Mar, production note filled. Reviewer picks the
template, Apply → real drafts, provenance-bannered. Confirmation: *"Created
customer Hotel D'Angleterre and draft SO-2026-00XX (15 bikes, red, 15 Mar).
One thing needs you: which model."*

## Action catalog by risk tier

Actions live in a **code registry** (the provider-registry doctrine), each
declaring its tier; tier decides behavior. *As built in VC-1 this landed as
`src/lib/inbound/command/{agent,plan,resolvers}.ts` — there is no
`actions.ts`; the draft-action wrappers sit in `plan.ts`.*

**Tier A — drafts & notes** (propose → one-click apply; auto-apply is the
graduation path):
- draft **sales order** · draft **customer** (+ contact — "new contact at
  Kommune: Mikkel, 31 22 44 55" feeds the save-caller learning loop)
- draft **purchase order** — *"PO from Shimano Nordic, 15 motors for Norma
  XL"*: supplier resolve → part resolve **via the template's recipe** (the
  BOM contains exactly one motor — a resolution path generic systems don't
  have) → existing draft-PO engine (landed-cost snapshots for free)
- draft **MO** ("plan 20 Norma S in black next week") · draft
  **maintenance ticket** (staff-reported) · draft **invoice from SO/WO**
  (numbers allocate at issue — drafts safe)
- **notes**: production note on SO, note on bike/org/ticket
- **floor dictation**: "finished WO-123, replaced brake pads and rear
  tube, 1.5 hours" → WO parts + labor + note, drafted for the tech to
  confirm

**Tier B — state changes** (always explicit confirm, never auto): receive
stock · slate bikes to a customer · update delivery week · close/complete
transitions.

**Tier C — never by voice in v1** (design rule): issue invoice · email a
supplier · deliver an SO · delete anything · payments.

**Adjacent, deliberately separate (v2):** read-only **voice queries**
("how many Norma S in stock?") — same ingress, answers instead of
actions. Not blended into v1.

## Entity resolution (deterministic, reusing matcher patterns)

Read-only resolver tools the agent must call before proposing:
`search_customer` (trigram on legal/display names — the org matcher),
`search_supplier`, `search_part` (SKU/name trigram), `resolve_template`
(name + family), `resolve_color` (vocab), `resolve_part_via_recipe`
(template → BOM → category/kind filter), `find_open_order` (SO/PO/WO/MO by
number or customer). Exactly-one → resolved chip; several → candidate list
in the plan; none → open slot or "offer to create" (customers/contacts
only — never invent parts, templates, or suppliers).

## Schema & code (sketch)

```sql
ALTER TABLE inbound_messages
  ADD COLUMN kind TEXT NOT NULL DEFAULT 'customer'
    CHECK (kind IN ('customer','command')),
  ADD COLUMN command_plan JSONB,       -- proposed actions + resolutions + open slots
  ADD COLUMN commanded_by UUID;        -- FK people(id) — WHO spoke (provenance)

CREATE TABLE command_actions (         -- one row per APPLIED action
  id UUID PK, message_id FK, action_type TEXT,
  payload JSONB, entity_table TEXT, entity_id UUID,  -- what got created
  applied_by UUID, applied_at TIMESTAMPTZ
);
```

- `src/lib/inbound/command/{agent,resolvers,actions}.ts` — the loop, the
  read-only tools, the registry (each action: schema + tier + a thin
  wrapper around the existing server action).
- Inbox detail: `CommandPlanPanel` (chips, candidate pickers, open-slot
  inputs, Apply buttons) — renders when `kind='command'`.
- Header: "Dictate a command" button (MediaRecorder → upload ingress →
  redirect to the command row).
- Voice webhook: staff-number check against `people.phones` → `kind`,
  command greeting (beep), same recording/status callbacks.

## Dependencies & logistics

1. **People & roles Phase 1** (`docs/plan-people-roles.md`) must land
   first — staff identity BY PHONE is the routing key, and `commanded_by`
   is the provenance. (Voice commands is that design's first consumer.)
2. **The number**: Munin takes +45 9370 3111 (its locked decision), so FMS
   staff commands ride *Jensen's* line — the US trial number now, Dennis's
   company number when it arrives. Same webhook serves both faces: staff
   numbers → commands, everyone else → customer voicemail.
3. Costs: same pennies-per-call as the inbound pipeline + Haiku-class
   agent tokens.

## Phasing

- **VC-1 · Command trunk + agent + first three actions** (~2–2.5 d):
  `kind` fork + staff routing, agent loop + resolvers, `draft_customer` /
  `draft_sales_order` / `draft_purchase_order`, CommandPlanPanel in Inbox,
  in-app dictate button, SMS confirmation. *The founding utterance works
  end to end.*
- **VC-2 · Floor + maintenance actions** (~1 d): draft_ticket, WO
  parts/labor dictation, notes-everywhere.
- **VC-3 · Tier B + graduation** (with Dennis, unscheduled): confirm-flow for
  state changes; per-action accuracy stats; first auto-applies.

## Deliberately NOT building

Voice queries (v2) · Tier C actions by voice · browser speech API for
commands (one pipeline) · a separate command inbox (the Inbox IS the
review surface) · auto-apply before measured accuracy.
