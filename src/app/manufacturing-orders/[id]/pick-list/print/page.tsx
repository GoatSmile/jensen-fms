import Link from "next/link";
import { notFound } from "next/navigation";

import { PrintButton } from "@/app/parts/print/_components/print-button";
import { Logo } from "@/components/logo";
import { createClient } from "@/lib/supabase/server";
import { compareKits, kitCode, stickerColor } from "@/lib/kits/colors";
import { formatQuantity } from "@/lib/parts/stock";

export const dynamic = "force-dynamic";

const one = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

type PickRow = {
  sku: string;
  name: string;
  perBike: number;
  total: number;
  also: string[];
};
type KitGroup = {
  code: string;
  hex: string;
  fg: string;
  complete: boolean;
  present: number;
  totalKit: number;
  rows: PickRow[];
};

/**
 * Printable batch pick sheet — one shelf-walk for a whole batch of identical
 * bikes. Parts come from the MO recipe × the batch size; grouped by kit bucket
 * (the sticker code the floor picks by), with a checkbox + batch total per line.
 * A kit the bike uses in full is flagged "whole bucket"; a partial kit says
 * "pick N of M". Batch size from ?n= (defaults to the unbuilt count).
 */
export default async function PickListPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ n?: string }>;
}) {
  const { id: moId } = await params;
  const { n } = await searchParams;
  const supabase = await createClient();

  const { data: mo, error: moErr } = await supabase
    .from("manufacturing_orders")
    .select(
      `id, mo_number, target_quantity,
       bike_template:bike_templates(name_en, family, frame_size),
       color:colors(name_en)`,
    )
    .eq("id", moId)
    .maybeSingle();
  if (moErr) throw new Error(`Failed to load MO: ${moErr.message}`);
  if (!mo) notFound();

  const { count: unbuiltCount } = await supabase
    .from("bikes")
    .select("id", { count: "exact", head: true })
    .eq("manufacturing_order_id", moId)
    .in("status", ["planning", "building"])
    .is("deleted_at", null);

  const requested = Number(n);
  const batch =
    Number.isFinite(requested) && requested > 0
      ? Math.floor(requested)
      : Math.max(1, unbuiltCount ?? mo.target_quantity ?? 1);

  // Recipe parts (excluding paint service SKUs — those aren't physically picked).
  const { data: recipe } = await supabase
    .from("manufacturing_order_parts")
    .select(
      `part_id, quantity_per_bike,
       part:parts!part_id(id, internal_sku, name_en, name_da)`,
    )
    .eq("manufacturing_order_id", moId);
  const parts = (recipe ?? [])
    .map((r) => ({
      partId: r.part_id as string,
      perBike: Number(r.quantity_per_bike ?? 0),
      part: one(r.part),
    }))
    .filter(
      (r) =>
        r.part &&
        r.perBike > 0 &&
        !(r.part.internal_sku ?? "").startsWith("JP-lak"),
    );

  // Kit grouping (mirrors the per-bike pick list): each part lands under its
  // first kit (by code); a part with more labels lists the others as "also".
  type KitRef = { id: string; sticker_color: string; kit_number: number | null };
  const kitsByPart = new Map<string, KitRef[]>();
  const involvedKits = new Map<string, KitRef>();
  const groups: KitGroup[] = [];
  let loose: PickRow[] = parts.map((r) => ({
    sku: r.part!.internal_sku,
    name: r.part!.name_en ?? r.part!.name_da ?? "—",
    perBike: r.perBike,
    total: r.perBike * batch,
    also: [],
  }));

  const partIds = parts.map((r) => r.partId);
  if (partIds.length > 0) {
    const { data: memberships } = await supabase
      .from("part_kits")
      .select("part_id, kit:kits!kit_id(id, sticker_color, kit_number, is_active)")
      .in("part_id", partIds);
    for (const m of memberships ?? []) {
      const kit = one(m.kit);
      if (!kit || !kit.is_active) continue;
      const ref: KitRef = {
        id: kit.id,
        sticker_color: kit.sticker_color,
        kit_number: kit.kit_number,
      };
      involvedKits.set(kit.id, ref);
      const list = kitsByPart.get(m.part_id) ?? [];
      list.push(ref);
      kitsByPart.set(m.part_id, list);
    }

    if (involvedKits.size > 0) {
      const { data: fullMemberships } = await supabase
        .from("part_kits")
        .select("kit_id, part:parts!part_id(id, deleted_at)")
        .in("kit_id", [...involvedKits.keys()]);
      const kitTotalParts = new Map<string, Set<string>>();
      for (const m of fullMemberships ?? []) {
        const part = one(m.part);
        if (!part || part.deleted_at != null) continue;
        const set = kitTotalParts.get(m.kit_id) ?? new Set<string>();
        set.add(part.id);
        kitTotalParts.set(m.kit_id, set);
      }

      const recipePartIdSet = new Set(partIds);
      const assigned = new Set<string>();
      for (const kit of [...involvedKits.values()].sort(compareKits)) {
        const rows: PickRow[] = [];
        for (const r of parts) {
          if (assigned.has(r.partId)) continue;
          const labels = (kitsByPart.get(r.partId) ?? []).sort(compareKits);
          if (labels.length === 0 || labels[0].id !== kit.id) continue;
          assigned.add(r.partId);
          rows.push({
            sku: r.part!.internal_sku,
            name: r.part!.name_en ?? r.part!.name_da ?? "—",
            perBike: r.perBike,
            total: r.perBike * batch,
            also: labels
              .slice(1)
              .map((l) => kitCode(l.sticker_color, l.kit_number)),
          });
        }
        if (rows.length === 0) continue;
        const fullSet = kitTotalParts.get(kit.id) ?? new Set<string>();
        const present = [...fullSet].filter((p) => recipePartIdSet.has(p)).length;
        const sc = stickerColor(kit.sticker_color);
        groups.push({
          code: kitCode(kit.sticker_color, kit.kit_number),
          hex: sc.hex,
          fg: sc.fg,
          complete: fullSet.size > 0 && present === fullSet.size,
          present,
          totalKit: fullSet.size,
          rows,
        });
      }
      loose = parts
        .filter((r) => !assigned.has(r.partId))
        .map((r) => ({
          sku: r.part!.internal_sku,
          name: r.part!.name_en ?? r.part!.name_da ?? "—",
          perBike: r.perBike,
          total: r.perBike * batch,
          also: [],
        }));
    }
  }

  const templateLabel = mo.bike_template
    ? [mo.bike_template.family, mo.bike_template.frame_size, mo.bike_template.name_en]
        .filter(Boolean)
        .join(" · ")
    : null;

  return (
    <div className="relative mx-auto flex max-w-3xl flex-col gap-6 p-6 print:max-w-none print:p-0">
      <div className="print-hidden flex items-center justify-between gap-3 rounded-md border p-3">
        <Link
          href={`/manufacturing-orders/${moId}`}
          className="text-muted-foreground text-sm underline underline-offset-4"
        >
          ← Back to {mo.mo_number}
        </Link>
        <PrintButton />
      </div>

      <header className="flex items-start justify-between gap-6 border-b-2 border-black pb-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-2xl font-semibold tracking-tight">Pick list</h1>
          <div className="text-sm">
            <span className="font-mono">{mo.mo_number}</span>
            {templateLabel ? ` · ${templateLabel}` : ""}
            {mo.color?.name_en ? ` · ${mo.color.name_en}` : ""}
          </div>
          <div className="text-sm font-medium">
            Build {batch} bike{batch === 1 ? "" : "s"}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          <Logo heightClass="h-9" />
          <div className="text-muted-foreground text-xs leading-relaxed">
            Staging bin: ______
            <br />
            Picked by: ______
          </div>
        </div>
      </header>

      {groups.length === 0 && loose.length === 0 ? (
        <p className="text-muted-foreground text-sm italic">
          This MO has no recipe parts to pick.
        </p>
      ) : null}

      {groups.map((g) => (
        <section key={g.code} className="break-inside-avoid">
          <div
            className="flex flex-wrap items-center gap-2 rounded-t-md px-3 py-2"
            style={{ backgroundColor: g.hex, color: g.fg }}
          >
            <span className="text-base font-semibold">{g.code}</span>
            <span
              className="rounded-full px-2 py-0.5 text-xs"
              style={{ backgroundColor: "rgba(255,255,255,0.25)" }}
            >
              {g.complete
                ? `whole bucket · ${batch} set${batch === 1 ? "" : "s"}`
                : `pick ${g.present} of ${g.totalKit}`}
            </span>
          </div>
          <PickTable rows={g.rows} />
        </section>
      ))}

      {loose.length > 0 ? (
        <section className="break-inside-avoid">
          <div className="flex items-center gap-2 rounded-t-md border border-dashed px-3 py-2">
            <span className="text-base font-semibold">Loose parts</span>
            <span className="text-muted-foreground text-xs">no sticker</span>
          </div>
          <PickTable rows={loose} />
        </section>
      ) : null}
    </div>
  );
}

function PickTable({ rows }: { rows: PickRow[] }) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b text-left">
          <th className="w-8 py-1 pr-2"></th>
          <th className="py-1 pr-2 font-medium">Part</th>
          <th className="text-muted-foreground w-14 py-1 pr-2 text-right text-xs font-medium">
            / bike
          </th>
          <th className="w-16 py-1 text-right font-medium">Pick</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.sku} className="border-b align-top">
            <td className="py-1.5 pr-2">
              <span className="inline-block size-4 rounded-[2px] border border-black" />
            </td>
            <td className="py-1.5 pr-2">
              {r.name}
              <span className="text-muted-foreground ml-2 font-mono text-[10px]">
                {r.sku}
              </span>
              {r.also.length > 0 ? (
                <span className="text-muted-foreground ml-2 text-[10px] italic">
                  also {r.also.join(", ")}
                </span>
              ) : null}
            </td>
            <td className="text-muted-foreground py-1.5 pr-2 text-right tabular-nums">
              ×{formatQuantity(r.perBike)}
            </td>
            <td className="py-1.5 text-right text-base font-semibold tabular-nums">
              {formatQuantity(r.total)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
