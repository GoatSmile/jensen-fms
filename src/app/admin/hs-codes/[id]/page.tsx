import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ChevronRight } from "lucide-react";

import { SegmentedId } from "@/components/segmented-id";
import { createClient } from "@/lib/supabase/server";

import { ArchiveButton } from "../_components/archive-button";
import {
  HsCodeForm,
  type HsCodeFormValues,
} from "../_components/hs-code-form";

export default async function HsCodeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [codeRes, partsRes] = await Promise.all([
    supabase
      .from("hs_codes")
      .select(
        "id, code, description, tariff_pct, anti_dumping_pct, notes, is_active",
      )
      .eq("id", id)
      .maybeSingle(),
    // The actual parts classified under this code — rendered as a linked
    // list below the form. tariff_pct_override is pulled so we can flag
    // parts that ignore this code's rate.
    supabase
      .from("parts")
      .select("id, internal_sku, name_en, tariff_pct_override")
      .eq("hs_code_id", id)
      .is("deleted_at", null)
      .order("internal_sku", { ascending: true }),
  ]);

  if (codeRes.error) {
    throw new Error(`Failed to load HS code: ${codeRes.error.message}`);
  }
  if (!codeRes.data) notFound();

  const c = codeRes.data;
  const parts = partsRes.data ?? [];
  const partCount = parts.length;

  // Form stores the human-readable percent (e.g. "5.2"), DB stores the
  // decimal (0.052). Convert once on the way in.
  const tariffAsPercent = String(
    Math.round(Number(c.tariff_pct) * 10000) / 100,
  );
  const antiDumpingAsPercent =
    c.anti_dumping_pct == null
      ? ""
      : String(Math.round(Number(c.anti_dumping_pct) * 10000) / 100);

  const initial: HsCodeFormValues = {
    code: c.code,
    description: c.description,
    tariff: tariffAsPercent,
    antiDumping: antiDumpingAsPercent,
    notes: c.notes ?? "",
    is_active: c.is_active,
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4 sm:p-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Dashboard</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/admin">Admin</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/admin/hs-codes">HS / TARIC codes</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="font-mono">{c.code}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="font-mono text-2xl font-semibold">{c.code}</h1>
          <p className="text-muted-foreground text-sm">{c.description}</p>
        </div>
        <Badge variant={c.is_active ? "success" : "outline"}>
          {c.is_active ? "Active" : "Archived"}
        </Badge>
      </header>

      <HsCodeForm mode={{ kind: "edit", id: c.id }} initial={initial} />

      {/* Parts classified under this code. Each links to its part page.
          A part with a tariff_pct_override ignores this code's rate, so
          flag it so the admin isn't surprised when its landed cost
          doesn't track edits here. */}
      <section className="rounded-md border">
        <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Parts using this code</h2>
          <span className="text-muted-foreground text-xs">
            {partCount} part{partCount === 1 ? "" : "s"}
          </span>
        </header>
        {partCount === 0 ? (
          <p className="text-muted-foreground p-4 text-sm italic">
            No parts are classified under this code yet. Assign it on a
            part&rsquo;s edit page.
          </p>
        ) : (
          <ul className="divide-y">
            {parts.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/parts/${p.id}`}
                  className="hover:bg-muted/40 flex items-center justify-between gap-3 px-4 py-2.5 transition-colors"
                >
                  <div className="flex min-w-0 flex-col">
                    <SegmentedId
                      value={p.internal_sku}
                      className="text-xs"
                    />
                    <span className="text-muted-foreground truncate text-sm">
                      {p.name_en}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {p.tariff_pct_override != null ? (
                      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                        Tariff override
                      </span>
                    ) : null}
                    <ChevronRight
                      className="text-muted-foreground/60 size-4"
                      aria-hidden
                    />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ArchiveButton
        id={c.id}
        isActive={c.is_active}
        partCount={partCount}
      />
    </div>
  );
}
