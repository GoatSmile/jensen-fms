/**
 * Sales enquiry → command-agent task text.
 *
 * An inbound `order_inquiry` call IS an implicit staff command — "a customer
 * rang wanting 25 bikes, set them up" — so instead of building a second
 * bespoke action system for leads, we phrase the call as a task and hand it
 * to the command agent that VC-1 already built. The reviewer then gets the
 * same CommandPlanPanel: proposed DRAFT actions, open slots for anything the
 * resolvers couldn't ground, applied one at a time. Nothing auto-writes.
 *
 * What this file does NOT do is decide anything. It only assembles context —
 * the raw transcript plus the structured extraction as hints. Resolution and
 * proposal stay in agent.ts + resolvers.ts, where the "never invent" rules
 * already live.
 *
 * Pure: no I/O, no DB. Callers pass the row's fields in.
 */
import type { InboundExtraction } from "../extraction";

/** Below this, transcripts are unreliable enough that the agent must be told. */
const LOW_CLARITY = 0.6;

/**
 * Phrase an inbound enquiry as a staff task for the command agent.
 *
 * The transcript leads and the extraction follows as hints, deliberately: the
 * extraction is a lossy summary shaped for repair triage (it has fields for
 * frame numbers and colours, none for quantity or deadline), so the raw text
 * is where "25 bikes by October, wants a service agreement" actually lives.
 */
export function buildInquiryTask(opts: {
  transcript: string | null;
  extraction: InboundExtraction;
  /** `transcript_confidence` from the row, when the channel reports one. */
  clarity: number | null;
  /** E.164 the call arrived from, as a fallback contact detail. */
  fromIdentity: string | null;
}): string {
  const { transcript, extraction, clarity, fromIdentity } = opts;

  const hints: string[] = [];
  if (extraction.organizationName) hints.push(`Customer/organisation: ${extraction.organizationName}`);
  if (extraction.callerName) hints.push(`Caller: ${extraction.callerName}`);
  const phone = extraction.callbackNumber ?? fromIdentity;
  if (phone) hints.push(`Callback number: ${phone}`);
  if (extraction.bikeTypeHint) hints.push(`Bike types mentioned: ${extraction.bikeTypeHint}`);
  if (extraction.colorHint) hints.push(`Colour mentioned: ${extraction.colorHint}`);
  if (extraction.language) hints.push(`Language spoken: ${extraction.language}`);
  if (extraction.problem) hints.push(`What they want: ${extraction.problem}`);
  if (extraction.callSummary) hints.push(`Call summary: ${extraction.callSummary}`);
  if (extraction.commitments.length > 0) {
    hints.push(`We promised: ${extraction.commitments.join("; ")}`);
  }

  const parts: string[] = [
    "A customer phoned with a SALES ENQUIRY. Set up what we can as drafts so " +
      "the workshop can follow it up.",
    "",
    "Rules for this task, on top of your normal ones:",
    "- Propose a draft_customer ONLY if search_customer finds no existing match.",
    "- Propose a draft_sales_order for the bikes they asked about. Put the " +
      "quantity, the delivery timing and anything about specification " +
      "(step-through, electric, cargo, baskets, logo) in the production note.",
    "- If they mentioned a service agreement, a recurring price, or anything " +
      "we cannot draft, say so in `notes` — do not invent an action for it.",
    "- Do NOT propose a purchase order. Nothing has been sold yet.",
  ];

  if (clarity !== null && clarity < LOW_CLARITY) {
    parts.push(
      `- The transcript is a LOW-CONFIDENCE machine transcription (clarity ` +
        `${clarity.toFixed(2)}). Names, numbers and product words may be ` +
        `garbled. Where a word is doubtful, leave the field null and note it ` +
        `rather than guessing — a wrong template or colour is worse than an ` +
        `open slot for the reviewer to fill.`,
    );
  }

  if (hints.length > 0) {
    parts.push("", "What we extracted from the call:", ...hints.map((h) => `- ${h}`));
  }

  if (transcript?.trim()) {
    parts.push("", "Transcript of the call:", transcript.trim());
  }

  return parts.join("\n");
}
