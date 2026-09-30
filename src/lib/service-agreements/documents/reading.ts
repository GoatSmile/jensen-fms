/**
 * What the model read off a signed service agreement — the PROPOSAL a person
 * confirms on the review page (migration 110). Stored verbatim in
 * `service_agreement_documents.reading`; this module is the defensive parser
 * both the reader and the review page use, so a partial or malformed reply
 * degrades to empty fields instead of throwing. Pure — no I/O.
 *
 * The model never writes: it reads. Matching frames to bikes is code
 * (`./match.ts`), and nothing reaches an agreement until a person confirms.
 */

export const CONTRACT_TYPES = ["K1", "K3", "K5", "K10"] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

export function isContractType(v: unknown): v is ContractType {
  return typeof v === "string" && (CONTRACT_TYPES as readonly string[]).includes(v);
}

export type ReadFrame = {
  /** As printed on the paper. */
  frame_number: string;
  /** Make / model / type text in the same row, if any. */
  description: string | null;
};

export type AgreementReading = {
  customer_name: string | null;
  department: string | null;
  contract_type: ContractType | null;
  term_years: number | null;
  signed_on: string | null;
  signatories: string | null;
  price_amount: number | null;
  price_period: "month" | "year" | null;
  currency: string | null;
  has_gps: boolean | null;
  frames: ReadFrame[];
  /** Anything the model flags as unclear, crossed out or handwritten. */
  remarks: string | null;
  confidence: "low" | "medium" | "high" | null;
};

export const EMPTY_READING: AgreementReading = {
  customer_name: null,
  department: null,
  contract_type: null,
  term_years: null,
  signed_on: null,
  signatories: null,
  price_amount: null,
  price_period: null,
  currency: null,
  has_gps: null,
  frames: [],
  remarks: null,
  confidence: null,
};

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    // Danish money: "1.704,00" → 1704; "142" → 142.
    const cleaned = v.replace(/kr\.?|dkk/gi, "").trim();
    const n = /,\d{1,2}$/.test(cleaned)
      ? Number(cleaned.replace(/\./g, "").replace(",", "."))
      : Number(cleaned.replace(/[.\s](?=\d{3}\b)/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function isoDate(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) return s;
  const dk = /^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})$/.exec(s);
  if (dk) {
    const y = dk[3].length === 2 ? `20${dk[3]}` : dk[3];
    return `${y}-${dk[2].padStart(2, "0")}-${dk[1].padStart(2, "0")}`;
  }
  return null;
}

/** Parse the model's tool input (or a stored reading) into a safe shape. */
export function parseAgreementReading(input: unknown): AgreementReading {
  if (!input || typeof input !== "object") return { ...EMPTY_READING };
  const o = input as Record<string, unknown>;
  const ct = typeof o.contract_type === "string" ? o.contract_type.toUpperCase().replace(/\s/g, "") : null;
  // Structured outputs do not guarantee an enum's capitalisation.
  const lower = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : null);
  const periodRaw = lower(o.price_period);
  const period = periodRaw === "month" || periodRaw === "year" ? periodRaw : null;
  const confRaw = lower(o.confidence);
  const conf = confRaw === "low" || confRaw === "medium" || confRaw === "high" ? confRaw : null;
  const seen = new Set<string>();
  const frames: ReadFrame[] = [];
  for (const f of Array.isArray(o.frames) ? o.frames : []) {
    const raw =
      typeof f === "string" ? str(f) : f && typeof f === "object" ? str((f as Record<string, unknown>).frame_number) : null;
    if (!raw) continue;
    const key = raw.toUpperCase().replace(/[\s.\-]/g, "");
    if (seen.has(key)) continue;
    seen.add(key);
    frames.push({
      frame_number: raw,
      description:
        f && typeof f === "object" ? str((f as Record<string, unknown>).description) : null,
    });
  }
  const term = num(o.term_years);
  return {
    customer_name: str(o.customer_name),
    department: str(o.department),
    contract_type: isContractType(ct) ? ct : null,
    term_years: term != null && term > 0 && term <= 20 ? Math.round(term) : null,
    signed_on: isoDate(o.signed_on),
    signatories: str(o.signatories),
    price_amount: num(o.price_amount),
    price_period: period,
    currency: str(o.currency)?.toUpperCase().slice(0, 3) ?? null,
    has_gps: typeof o.has_gps === "boolean" ? o.has_gps : null,
    frames,
    remarks: str(o.remarks),
    confidence: conf,
  };
}

/** The yearly price the paper implies — a monthly figure × 12. */
export function yearlyPriceOf(r: AgreementReading): number | null {
  if (r.price_amount == null) return null;
  return r.price_period === "month" ? Math.round(r.price_amount * 12 * 100) / 100 : r.price_amount;
}

/** K-type from the term, when the paper states years but no K. */
export function contractTypeOf(r: AgreementReading): ContractType | null {
  if (r.contract_type) return r.contract_type;
  const t = r.term_years;
  if (t === 1 || t === 3 || t === 5 || t === 10) return `K${t}` as ContractType;
  return null;
}
