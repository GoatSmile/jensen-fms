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
export type InboundConfidence = "low" | "medium" | "high";

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
  /**
   * The model's own confidence that it parsed the message correctly — how
   * hard the audio/text was to make sense of, NOT how sure it is about any
   * one field. Weakly calibrated by nature, so it's an ordinal hint for the
   * reviewer, cross-read against transcript_confidence, never a gate.
   */
  confidence: InboundConfidence | null;
  /**
   * Live bridged CALLS only (docs/plan-live-call-recording.md) — null for a
   * voicemail, which is a monologue with no outcome to record.
   *
   * A conversation's valuable residue isn't "what they said", it's what was
   * AGREED: `callSummary` is what the call was about + how it ended;
   * `commitments` is what WE promised, which is the part that burns the
   * workshop if it's forgotten.
   */
  callSummary: string | null;
  commitments: string[];
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
  confidence: null,
  callSummary: null,
  commitments: [],
};

const INTENTS: InboundIntent[] = ["repair_request", "order_inquiry", "other"];
const URGENCIES: InboundUrgency[] = ["low", "normal", "high"];
const CONFIDENCES: InboundConfidence[] = ["low", "medium", "high"];

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
  const confidence = str(o.confidence);
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
    confidence: (CONFIDENCES as string[]).includes(confidence ?? "")
      ? (confidence as InboundConfidence)
      : null,
    callSummary: str(o.callSummary),
    commitments: Array.isArray(o.commitments)
      ? o.commitments
          .map(str)
          .filter((c): c is string => c !== null)
          .slice(0, 10)
      : [],
  };
}
