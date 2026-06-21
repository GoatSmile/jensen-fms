"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { round2 } from "@/lib/invoicing/status";
import { formatDkk } from "@/lib/parts/stock";

export type CreateDepositResult = { ok: false; error: string };

export type DepositPartInput = {
  partId: string;
  quantity: number;
  unitPrice: number;
};

export type DepositInput =
  | { mode: "percent"; value: number }
  | { mode: "amount"; value: number }
  | { mode: "parts"; parts: DepositPartInput[] };

type LineRow = {
  line_number: number;
  part_id: string | null;
  description_en: string;
  description_da: string;
  quantity: number;
  unit_price: number;
  vat_code: string;
  vat_rate: number;
  line_subtotal: number;
  line_vat_amount: number;
  line_total: number;
};

/**
 * Draft a DEPOSIT invoice (acontofaktura) for a sales order — a down payment
 * taken before delivery. Two kinds, same VAT timing (recognised at issue):
 *   A) percent / amount — a single summary line, not tied to parts.
 *   B) parts — the customer prepays specific catalog parts (e.g. "the frames,
 *      they're special parts"); the invoice itemises them. The issued line's
 *      part_id rows are the record the stock-valuation report reads to exclude
 *      paid-for stock — no separate "customer-paid" flag needed.
 *
 * Either kind deducts the same way on the final (final = order − Σ deposits),
 * so part-based deposits need no special handling there. Multiple deposits
 * (installments) are allowed, capped so their cumulative subtotal can't exceed
 * the order's. Draft (DRAFT-xxxx); the INV number + VAT land at issue.
 */
export async function createDepositInvoice(
  soId: string,
  input: DepositInput,
): Promise<CreateDepositResult> {
  if (!soId) return { ok: false, error: "Missing sales order id." };

  const supabase = await createClient();

  const { data: so, error: soErr } = await supabase
    .from("sales_orders")
    .select(
      `id, sales_order_number, status, organization_id, language, currency,
       subtotal_amount,
       lines:sales_order_lines(vat_code, vat_rate, line_subtotal)`,
    )
    .eq("id", soId)
    .maybeSingle();
  if (soErr || !so) {
    return {
      ok: false,
      error: `Could not load sales order: ${soErr?.message ?? "not found"}`,
    };
  }
  if (!so.organization_id) {
    return { ok: false, error: "The sales order has no customer organization." };
  }
  if (!["confirmed", "in_production", "ready"].includes(so.status)) {
    return {
      ok: false,
      error: `Deposits can be taken on a confirmed–ready order. This one is ${so.status}.`,
    };
  }

  const soSubtotal = round2(Number(so.subtotal_amount ?? 0));
  if (soSubtotal <= 0) {
    return { ok: false, error: "The sales order has no value to deposit against." };
  }

  // Order VAT: the code covering the most subtotal (single-VAT orders are the
  // norm; a 0 %/reverse-charge export order's deposit then inherits 0 %).
  const { data: vatCodes } = await supabase
    .from("vat_codes")
    .select("code, default_rate, is_export, is_reverse_charge");
  const vatByCode = new Map((vatCodes ?? []).map((v) => [v.code, v]));
  const soLines = so.lines ?? [];
  const sumByCode = new Map<string, number>();
  for (const l of soLines) {
    const code = l.vat_code ?? "DK_STANDARD";
    sumByCode.set(code, (sumByCode.get(code) ?? 0) + Number(l.line_subtotal ?? 0));
  }
  let vatCode = "DK_STANDARD";
  let best = -1;
  for (const [code, sum] of sumByCode) {
    if (sum > best) {
      best = sum;
      vatCode = code;
    }
  }
  const vatRate = Number(
    soLines.find((l) => (l.vat_code ?? "DK_STANDARD") === vatCode)?.vat_rate ??
      vatByCode.get(vatCode)?.default_rate ??
      25,
  );
  const isExport = vatByCode.get(vatCode)?.is_export === true;
  const isReverseCharge = vatByCode.get(vatCode)?.is_reverse_charge === true;

  // Build the deposit line(s) + subtotal, by kind.
  const lineRows: LineRow[] = [];
  let depositSubtotal = 0;

  if (input.mode === "parts") {
    if (!input.parts || input.parts.length === 0) {
      return { ok: false, error: "Add at least one part to prepay." };
    }
    const partIds = input.parts.map((p) => p.partId);
    const { data: catalog } = await supabase
      .from("parts")
      .select("id, name_en, name_da, internal_sku")
      .in("id", partIds);
    const partById = new Map((catalog ?? []).map((p) => [p.id, p]));

    let n = 0;
    for (const pl of input.parts) {
      const qty = Number(pl.quantity);
      const up = round2(Number(pl.unitPrice));
      if (!Number.isFinite(qty) || qty <= 0) {
        return { ok: false, error: "Each prepaid part needs a positive quantity." };
      }
      if (!Number.isFinite(up) || up < 0) {
        return { ok: false, error: "Each prepaid part needs a valid unit price." };
      }
      const part = partById.get(pl.partId);
      if (!part) return { ok: false, error: "One of the parts could not be found." };
      const sku = part.internal_sku ? ` (${part.internal_sku})` : "";
      const ls = round2(qty * up);
      const lv = round2(ls * (vatRate / 100));
      n += 1;
      lineRows.push({
        line_number: n,
        part_id: pl.partId,
        description_en: `Prepaid: ${part.name_en ?? part.name_da ?? "part"}${sku}`,
        description_da: `Forudbetalt: ${part.name_da ?? part.name_en ?? "del"}${sku}`,
        quantity: qty,
        unit_price: up,
        vat_code: vatCode,
        vat_rate: vatRate,
        line_subtotal: ls,
        line_vat_amount: lv,
        line_total: round2(ls + lv),
      });
      depositSubtotal = round2(depositSubtotal + ls);
    }
    if (depositSubtotal <= 0) {
      return { ok: false, error: "The prepaid parts work out to zero." };
    }
  } else {
    const value = Number(input.value);
    if (!Number.isFinite(value) || value <= 0) {
      return { ok: false, error: "Enter a positive percentage or amount." };
    }
    if (input.mode === "percent" && value > 100) {
      return { ok: false, error: "Percentage can't exceed 100." };
    }
    depositSubtotal =
      input.mode === "percent"
        ? round2(soSubtotal * (value / 100))
        : round2(value);
    if (depositSubtotal <= 0) {
      return { ok: false, error: "The deposit works out to zero — raise the amount." };
    }
    const pct = round2((depositSubtotal / soSubtotal) * 100);
    const lv = round2(depositSubtotal * (vatRate / 100));
    lineRows.push({
      line_number: 1,
      part_id: null,
      description_en: `Down payment (${pct}% of order ${so.sales_order_number})`,
      description_da: `Acontobetaling (${pct}% af ordre ${so.sales_order_number})`,
      quantity: 1,
      unit_price: depositSubtotal,
      vat_code: vatCode,
      vat_rate: vatRate,
      line_subtotal: depositSubtotal,
      line_vat_amount: lv,
      line_total: round2(depositSubtotal + lv),
    });
  }

  // Installments allowed, but cumulative deposit subtotal can't exceed the order.
  const { data: priorDeposits } = await supabase
    .from("invoices")
    .select("subtotal_amount")
    .eq("sales_order_id", soId)
    .eq("kind", "deposit")
    .not("status", "in", "(cancelled,credited)")
    .is("credited_invoice_id", null);
  const priorSum = round2(
    (priorDeposits ?? []).reduce((s, d) => s + Number(d.subtotal_amount ?? 0), 0),
  );
  if (round2(priorSum + depositSubtotal) > soSubtotal) {
    return {
      ok: false,
      error: `Deposits would exceed the order subtotal — ${formatDkk(priorSum)} already taken of ${formatDkk(soSubtotal)}.`,
    };
  }

  const totalVat = round2(
    lineRows.reduce((s, l) => s + l.line_vat_amount, 0),
  );
  const depositPct = round2((depositSubtotal / soSubtotal) * 100);

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .insert({
      invoice_number: `DRAFT-${crypto.randomUUID().slice(0, 8)}`,
      kind: "deposit",
      deposit_pct: depositPct,
      sales_order_id: soId,
      organization_id: so.organization_id,
      language: so.language ?? "da",
      status: "draft",
      currency: (so.currency as string | null)?.trim() || "DKK",
      subtotal_amount: depositSubtotal,
      total_vat_amount: totalVat,
      total_amount: round2(depositSubtotal + totalVat),
      is_export: isExport,
      is_reverse_charge: isReverseCharge,
      notes:
        input.mode === "parts"
          ? `Prepaid parts on ${so.sales_order_number}.`
          : `Down payment on ${so.sales_order_number}.`,
    })
    .select("id")
    .single();
  if (invErr || !invoice) {
    return {
      ok: false,
      error: `Could not create deposit invoice: ${invErr?.message ?? "unknown error"}`,
    };
  }

  const { error: lineErr } = await supabase
    .from("invoice_lines")
    .insert(lineRows.map((l) => ({ ...l, invoice_id: invoice.id })));
  if (lineErr) {
    await supabase.from("invoices").delete().eq("id", invoice.id);
    return {
      ok: false,
      error: `Could not write the deposit lines: ${lineErr.message}`,
    };
  }

  revalidatePath("/invoices");
  revalidatePath(`/sales-orders/${soId}`);
  redirect(`/invoices/${invoice.id}`);
}
