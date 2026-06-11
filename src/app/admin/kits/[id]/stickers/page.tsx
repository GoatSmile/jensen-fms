import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { kitCode, stickerColor } from "@/lib/kits/colors";

import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

/**
 * Printable sticker sheet for a kit: one sticker per labelled part (colour
 * band + BIG number — full-code picking — plus SKU and name) and one header
 * sticker for the kit bucket itself. Plain A4 grid via @media print; the app
 * chrome (sidebar, nav, this page's toolbar) is print-hidden.
 */
export default async function KitStickerSheetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [kitRes, membersRes] = await Promise.all([
    supabase
      .from("kits")
      .select("id, sticker_color, kit_number, description, is_active")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("part_kits")
      .select("part:parts!part_id(id, internal_sku, name_en, deleted_at)")
      .eq("kit_id", id),
  ]);

  if (kitRes.error) throw new Error(`Failed to load kit: ${kitRes.error.message}`);
  const kit = kitRes.data;
  if (!kit) notFound();

  const parts = (membersRes.data ?? [])
    .map((m) => (Array.isArray(m.part) ? m.part[0] : m.part))
    .filter((p): p is NonNullable<typeof p> => p != null && p.deleted_at == null)
    .sort((a, b) => a.internal_sku.localeCompare(b.internal_sku));

  const code = kitCode(kit.sticker_color, kit.kit_number);
  const colour = stickerColor(kit.sticker_color);

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6 print:gap-2 print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href={`/admin/kits/${id}`}>
              <ArrowLeft aria-hidden /> Back to kit
            </Link>
          </Button>
          <h1 className="text-xl font-semibold">
            Sticker sheet — {code}
          </h1>
        </div>
        <PrintButton />
      </div>
      <p className="text-muted-foreground text-sm print:hidden">
        {parts.length} part sticker{parts.length === 1 ? "" : "s"} + 1 kit
        header sticker. Print on A4 label paper and cut along the borders.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-3 print:gap-2">
        {/* Kit header sticker — for the picking bucket itself. */}
        <Sticker
          hex={colour.hex}
          fg={colour.fg}
          code={code}
          line1={kit.description ?? "Kit"}
          line2={null}
        />
        {parts.map((p) => (
          <Sticker
            key={p.id}
            hex={colour.hex}
            fg={colour.fg}
            code={code}
            line1={p.internal_sku}
            line2={p.name_en}
          />
        ))}
      </div>
    </div>
  );
}

function Sticker({
  hex,
  fg,
  code,
  line1,
  line2,
}: {
  hex: string;
  fg: string;
  code: string;
  line1: string;
  line2: string | null;
}) {
  return (
    <div
      className="flex flex-col overflow-hidden rounded-md border border-black/20"
      style={{ breakInside: "avoid" }}
    >
      <div
        className="flex items-center justify-center px-2 py-3"
        style={{ backgroundColor: hex, color: fg }}
      >
        <span className="text-3xl font-extrabold tracking-wide">{code}</span>
      </div>
      <div className="flex flex-col gap-0.5 px-2 py-1.5">
        <span className="truncate font-mono text-xs font-semibold">
          {line1}
        </span>
        {line2 ? (
          <span className="text-muted-foreground truncate text-xs print:text-black">
            {line2}
          </span>
        ) : null}
      </div>
    </div>
  );
}
