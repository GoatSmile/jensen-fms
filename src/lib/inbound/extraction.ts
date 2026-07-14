/**
 * The structured payload the extraction stage (Slice C, Claude) produces from
 * `body_text`, and the matcher (Slice D) consumes. Defining it now lets D be
 * built and tested against hand-written JSON before C exists — the harness
 * detail page has an editor that writes this shape onto `extraction`.
 *
 * Channel-blind: these are facts about "what they said", not about voicemail.
 */

export type InboundIntent = "repair_request" | "order_inquiry" | "other";
export type InboundUrgency = "low" | "normal" | "high";

export type InboundExtraction = {
  callerName: string | null;
  organizationName: string | null;
  /** A phone number spoken in the message ("call me back on…"). */
  callbackNumber: string | null;
  frameNumber: string | null;
  qrCode: string | null;
  /** The customer's own fleet numbering ("bike 25"). */
  fleetNumber: string | null;
  /** Free-text colour clue ("the red one"). */
  colorHint: string | null;
  /** Free-text bike-type clue ("the cargo bike"). */
  bikeTypeHint: string | null;
  problem: string | null;
  urgency: InboundUrgency | null;
  language: string | null;
  intent: InboundIntent | null;
};

export const EMPTY_EXTRACTION: InboundExtraction = {
  callerName: null,
  organizationName: null,
  callbackNumber: null,
  frameNumber: null,
  qrCode: null,
  fleetNumber: null,
  colorHint: null,
  bikeTypeHint: null,
  problem: null,
  urgency: null,
  language: null,
  intent: null,
};

const INTENTS: InboundIntent[] = ["repair_request", "order_inquiry", "other"];
const URGENCIES: InboundUrgency[] = ["low", "normal", "high"];

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/**
 * Defensively normalize arbitrary JSON (a model's output, or a hand-edited
 * harness payload) into a well-formed extraction — unknown/extra keys are
 * dropped, bad enums fall to null. Never throws.
 */
export function parseExtraction(raw: unknown): InboundExtraction {
  const o = (typeof raw === "object" && raw !== null ? raw : {}) as Record<
    string,
    unknown
  >;
  const intent = str(o.intent);
  const urgency = str(o.urgency);
  return {
    callerName: str(o.callerName),
    organizationName: str(o.organizationName),
    callbackNumber: str(o.callbackNumber),
    frameNumber: str(o.frameNumber),
    qrCode: str(o.qrCode),
    fleetNumber: str(o.fleetNumber),
    colorHint: str(o.colorHint),
    bikeTypeHint: str(o.bikeTypeHint),
    problem: str(o.problem),
    urgency: (URGENCIES as string[]).includes(urgency ?? "")
      ? (urgency as InboundUrgency)
      : null,
    language: str(o.language),
    intent: (INTENTS as string[]).includes(intent ?? "")
      ? (intent as InboundIntent)
      : null,
  };
}
