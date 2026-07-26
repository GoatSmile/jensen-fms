/**
 * Import-tax origin model (migration 54, July-2 items 2+3) — the pure,
 * client-safe half. Vocabulary, labels, and the two decision functions
 * shared by the PO line dialog (live preview / toggle default) and the
 * server-side snapshot writers in po-snapshots.ts. Keeping the decision
 * logic here means the UI default and the persisted snapshot can't drift.
 */

/** parts.origin — NULL in the DB means "unclassified". */
export type PartOrigin = "eu" | "non_eu";

export const PART_ORIGIN_LABELS: Record<PartOrigin, string> = {
  eu: "EU",
  non_eu: "Outside EU",
};

/**
 * purchase_order_lines.import_tax_basis — the frozen "why" behind the
 * tariff/anti-dumping snapshot. NULL on lines that predate migration 54.
 *
 *   applied          — import tax on, positive rate snapshotted
 *   zero_rated       — deliberate 0: the rate itself is 0 %, or the user
 *                      un-checked "Apply import tax" on a non-EU part with
 *                      no structural reason on file
 *   unclassified     — 0 because we don't know (origin and/or HS missing);
 *                      a data-quality gap, not a correct zero
 *   eu_origin        — 0 because the part is EU-origin (no duty exists)
 *   supplier_prepaid — 0 because the supplier delivered duty-paid
 */
export type ImportTaxBasis =
  | "applied"
  | "zero_rated"
  | "unclassified"
  | "eu_origin"
  | "supplier_prepaid";

/** Everything the snapshot decision needs to know about a (part, supplier). */
export type ImportTaxInputs = {
  origin: PartOrigin | null;
  /** Rate that WOULD be snapshotted if import tax is applied (override ?? HS). */
  tariffPct: number;
  antiDumpingPct: number;
  /** True when the part has a tariff override or an active HS code. */
  hasClassification: boolean;
  supplierPrepaid: boolean;
};

/**
 * Default state of the per-line "Apply import tax" toggle. Dennis's rule:
 * non-EU origin → tax applies, unless the supplier delivers duty-paid.
 * Unclassified origin defaults OFF ("initially without tariff, click to
 * add") — the basis records it as a data gap, and the UI nudges to classify.
 */
export function defaultApplyImportTax(
  origin: PartOrigin | null,
  supplierPrepaid: boolean,
): boolean {
  return origin === "non_eu" && !supplierPrepaid;
}

/**
 * The frozen snapshot for a PO line, given the user's (or the machine
 * default's) apply decision. Basis precedence when tax is off: the
 * structural reasons win over the manual one — eu_origin (no duty exists,
 * regardless of who'd pay) > supplier_prepaid > unclassified (origin
 * unknown) > zero_rated (deliberate un-check on a plain non-EU part).
 */
export function importTaxSnapshot(
  inputs: ImportTaxInputs,
  apply: boolean,
): {
  tariff_pct: number;
  anti_dumping_pct: number;
  import_tax_basis: ImportTaxBasis;
} {
  if (apply) {
    const basis: ImportTaxBasis = !inputs.hasClassification
      ? "unclassified"
      : inputs.tariffPct > 0 || inputs.antiDumpingPct > 0
        ? "applied"
        : "zero_rated";
    return {
      tariff_pct: inputs.tariffPct,
      anti_dumping_pct: inputs.antiDumpingPct,
      import_tax_basis: basis,
    };
  }
  const basis: ImportTaxBasis =
    inputs.origin === "eu"
      ? "eu_origin"
      : inputs.supplierPrepaid
        ? "supplier_prepaid"
        : inputs.origin == null
          ? "unclassified"
          : "zero_rated";
  return { tariff_pct: 0, anti_dumping_pct: 0, import_tax_basis: basis };
}

/**
 * One-line explanation of why the toggle defaults the way it does —
 * shown under the checkbox in the PO line dialog.
 */
export function importTaxDefaultHint(
  origin: PartOrigin | null,
  supplierPrepaid: boolean,
): string {
  if (origin === "eu") return "EU origin — no import tax.";
  if (supplierPrepaid) return "Import duty prepaid by the supplier.";
  if (origin == null) {
    return "Origin unclassified — import tax off by default. Set the origin on the part.";
  }
  return "Non-EU origin — import tax applies.";
}
