/**
 * What a press of the floating assistant button does — chosen by each person.
 * Mirrored by `people_assistant_mode_check` (migrations 124, 128, 130); a value
 * outside the list reads as the default.
 *
 *   ask_voice  THE SECRETARY (default; owner, 2026-10-21): record a spoken
 *              question or instruction, ask it on a pause, speak the answer,
 *              carry out what is safe. A note is something it does when asked.
 *   ask          open the panel to type (or dictate, then Send)
 *   note_toggle  record a spoken note; a second press saves it
 *   note_vad     record a spoken note; it saves itself on a pause
 *
 * The note modes stay as options for now (owner, 2026-10-21: "keep it as an
 * option, and we can remove it later"); migration 130 moved everyone on one
 * to the secretary.
 */
export const ASSISTANT_MODES = ["ask_voice", "ask", "note_toggle", "note_vad"] as const;
export type AssistantMode = (typeof ASSISTANT_MODES)[number];

export function parseAssistantMode(raw: unknown): AssistantMode {
  return (ASSISTANT_MODES as readonly unknown[]).includes(raw) ? (raw as AssistantMode) : "ask_voice";
}

/** A press records a spoken NOTE. */
export function isNoteMode(mode: AssistantMode): boolean {
  return mode === "note_toggle" || mode === "note_vad";
}

/** A press RECORDS (for the secretary, or a note) rather than opening the panel. */
export function isVoiceMode(mode: AssistantMode): boolean {
  return mode !== "ask";
}
