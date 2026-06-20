"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { round2 } from "@/lib/invoicing/status";
import { formatDkk } from "@/lib/parts/stock";

export type CreateDepositResult = { ok: false; error: string };

export type DepositInput = { mode: "percent" | "amount"; value: number };

/**
 * Draft a DEPOSIT invoice (acontofaktura) for a sales order — a down payment
 * taken before delivery. Tier 4 kind A: a single summary line, NOT tied to
 * specific parts. The deposit is struck either as a percentage of the order
 * subtotal or as an explicit ex-VAT amount; VAT is recognised at issue (the
 * Danish payment-before-delivery tax point). Multiple deposits (installments)
 * are allowed, capped so their cumulative subtotal can't exceed the order's.
 *
 * Same draft contract as the other invoice creators: DRAFT-xxxx placeholder,
 * the sequential INV number lands at issue (the deposit shares the INV series).
 */
export async function createDepositInvoice(
  soId: string,
  input: DepositInput,
): Promise<CreateDepositResult> {
  if (!soId) return { ok: false, error: "Missing sales order id." };
  const value = Number(input.value);
  if (!Number.isFinite(value) || value <= 0) {
    return { ok: false, error: "Enter a positive percentage or amount." };
  }
  if (input.mode === "percent" && value > 100) {
    return { ok: false, error: "Percentage can't exceed 100." };
  }

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
  // Deposits are taken before delivery — allow confirmed → ready, not draft
  // (nothing agreed yet) and not delivered/cancelled (that's the final / closed).
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

  // Order VAT: use the code covering the most subtotal (single-VAT orders are
  // the norm; a 0 %/reverse-charge export order's deposit then inherits 0 %).
  const { data: vatCodes } = await supabase
    .from("vat_codes")
    .select("code, default_rate, is_export, is_reverse_charge");
  const vatByCode = new Map((vatCodes ?? []).map((v) => [v.code, v]));
  const lines = so.lines ?? [];
  const sumByCode = new Map<string, number>();
  for (const l of lines) {
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
    lines.find((l) => (l.vat_code ?? "DK_STANDARD") === vatCode)?.vat_rate ??
      vatByCode.get(vatCode)?.default_rate ??
      25,
  );
  const isExport = vatByCode.get(vatCode)?.is_export === true;
  const isReverseCharge = vatByCode.get(vatCode)?.is_reverse_charge === true;

  // Deposit ex-VAT subtotal + the % it represents (for the line text + the
  // order "% invoiced" surface).
  let depositSubtotal: number;
  let depositPct: number;
  if (input.mode === "percent") {
    depositPct = round2(value);
    depositSubtotal = round2(soSubtotal * (value / 100));
  } else {
    depositSubtotal = round2(value);
    depositPct = round2((depositSubtotal / soSubtotal) * 100);
  }
  if (depositSubtotal <= 0) {
    return { ok: false, error: "The deposit works out to zero — raise the amount." };
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

  const lineVat = round2(depositSubtotal * (vatRate / 100));
  const lineTotal = round2(depositSubtotal + lineVat);

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
      total_vat_amount: lineVat,
      total_amount: lineTotal,
      is_export: isExport,
      is_reverse_charge: isReverseCharge,
      notes: `Down payment on ${so.sales_order_number}.`,
    })
    .select("id")
    .single();
  if (invErr || !invoice) {
    return {
      ok: false,
      error: `Could not create deposit invoice: ${invErr?.message ?? "unknown error"}`,
    };
  }

  const { error: lineErr } = await supabase.from("invoice_lines").insert({
    invoice_id: invoice.id,
    line_number: 1,
    description_en: `Down payment (${depositPct}% of order ${so.sales_order_number})`,
    description_da: `Acontobetaling (${depositPct}% af ordre ${so.sales_order_number})`,
    quantity: 1,
    unit_price: depositSubtotal,
    vat_code: vatCode,
    vat_rate: vatRate,
    line_subtotal: depositSubtotal,
    line_vat_amount: lineVat,
    line_total: lineTotal,
  });
  if (lineErr) {
    await supabase.from("invoices").delete().eq("id", invoice.id);
    return {
      ok: false,
      error: `Could not write the deposit line: ${lineErr.message}`,
    };
  }

  revalidatePath("/invoices");
  revalidatePath(`/sales-orders/${soId}`);
  redirect(`/invoices/${invoice.id}`);
}
