/**
 * What a press of the floating assistant button does — chosen by each person
 * (plan-inbox-notes.md, decision 1). Mirrored by `people_assistant_mode_check`
 * (migration 124); a value outside the list reads as `ask`.
 *
 *   ask          open the panel (type or dictate, get an answer)
 *   note_toggle  record a note; a second press saves it
 *   note_vad     record a note; it saves itself on a pause
 */
export const ASSISTANT_MODES = ["ask", "note_toggle", "note_vad"] as const;
export type AssistantMode = (typeof ASSISTANT_MODES)[number];

export function parseAssistantMode(raw: unknown): AssistantMode {
  return (ASSISTANT_MODES as readonly unknown[]).includes(raw) ? (raw as AssistantMode) : "ask";
}

export function isNoteMode(mode: AssistantMode): boolean {
  return mode !== "ask";
}
