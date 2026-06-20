import Link from "next/link";
import { notFound } from "next/navigation";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SegmentedId } from "@/components/segmented-id";
import { createClient } from "@/lib/supabase/server";
import { round2 } from "@/lib/invoicing/status";

import { DepositForm } from "./_components/deposit-form";

const CAN_DEPOSIT = ["confirmed", "in_production", "ready"];

export default async function NewDepositPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: so, error } = await supabase
    .from("sales_orders")
    .select(
      `id, sales_order_number, status, currency, subtotal_amount,
       lines:sales_order_lines(vat_code, vat_rate, line_subtotal)`,
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load SO: ${error.message}`);
  if (!so) notFound();

  // Dominant order VAT rate for the preview (same rule the action uses).
  const lines = so.lines ?? [];
  const sumByCode = new Map<string, { sum: number; rate: number }>();
  for (const l of lines) {
    const code = l.vat_code ?? "DK_STANDARD";
    const cur = sumByCode.get(code) ?? { sum: 0, rate: Number(l.vat_rate ?? 25) };
    cur.sum += Number(l.line_subtotal ?? 0);
    sumByCode.set(code, cur);
  }
  let vatRate = 25;
  let best = -1;
  for (const { sum, rate } of sumByCode.values()) {
    if (sum > best) {
      best = sum;
      vatRate = rate;
    }
  }

  // Deposits already taken (ex-VAT), so the form can show what's left.
  const { data: priorDeposits } = await supabase
    .from("invoices")
    .select("subtotal_amount")
    .eq("sales_order_id", id)
    .eq("kind", "deposit")
    .not("status", "in", "(cancelled,credited)")
    .is("credited_invoice_id", null);
  const priorDepositSubtotal = round2(
    (priorDeposits ?? []).reduce((s, d) => s + Number(d.subtotal_amount ?? 0), 0),
  );

  const soSubtotal = round2(Number(so.subtotal_amount ?? 0));
  const canDeposit = CAN_DEPOSIT.includes(so.status);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 p-4 sm:p-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/sales-orders">Sales orders</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={`/sales-orders/${id}`}>
                <SegmentedId value={so.sales_order_number} />
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>New deposit</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">New deposit invoice</h1>
        <p className="text-muted-foreground text-sm">
          A down payment on{" "}
          <span className="font-mono">{so.sales_order_number}</span>, taken before
          delivery. VAT is recognised when you issue it. The final invoice will
          bill only the remaining balance.
        </p>
      </header>

      {canDeposit && soSubtotal > 0 ? (
        <DepositForm
          soId={so.id}
          soNumber={so.sales_order_number}
          soSubtotal={soSubtotal}
          currency={(so.currency as string | null)?.trim() || "DKK"}
          vatRate={vatRate}
          priorDepositSubtotal={priorDepositSubtotal}
        />
      ) : (
        <p className="text-muted-foreground rounded-md border border-dashed p-4 text-sm">
          {soSubtotal <= 0
            ? "This order has no value to take a deposit on — add priced lines first."
            : `Deposits can be taken on a confirmed–ready order. This one is ${so.status}.`}
        </p>
      )}
    </div>
  );
}
