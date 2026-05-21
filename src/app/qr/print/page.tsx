import Link from "next/link";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { createClient } from "@/lib/supabase/server";
import { bikeStickerUrl, qrSvg } from "@/lib/qr";

import { PrintButton } from "@/app/parts/print/_components/print-button";

export const dynamic = "force-dynamic";

type SearchParams = {
  /** Comma-separated bike ids. Empty = use most-recently-created N bikes. */
  bikes?: string;
  /** Optional cap on how many bikes appear on the sheet. Default 24. */
  limit?: string;
};

/**
 * Batch-print QR stickers. Renders an A4-sized sheet with 3×8 = 24 cells
 * (≈ 60 × 35 mm each — fits common Avery template stocks). Each cell shows
 * the QR code, the frame number, and the template label.
 *
 * The global @media print rules in globals.css strip the sidebar / nav so
 * print previews show only the sheet. Browser print → save as PDF → take
 * to a printer.
 */
export default async function QRPrintPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const limit = Math.max(1, Math.min(96, parseInt(sp.limit ?? "24", 10) || 24));
  const ids = (sp.bikes ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const supabase = await createClient();
  let q = supabase
    .from("bikes")
    .select(
      `id, frame_number,
       template:bike_templates(family, frame_size, name_en)`,
    )
    .is("deleted_at", null)
    .order("frame_number", { ascending: true })
    .limit(limit);
  if (ids.length > 0) {
    q = q.in("id", ids);
  }
  const { data, error } = await q;
  if (error) throw new Error(`Failed to load bikes: ${error.message}`);
  const bikes = data ?? [];

  // Pre-render all QR SVGs in parallel.
  const qrs = await Promise.all(
    bikes.map(async (b) => ({
      bike: b,
      url: bikeStickerUrl(b.id),
      svg: await qrSvg(bikeStickerUrl(b.id), { width: 240, margin: 1 }),
    })),
  );

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col gap-6 p-4 sm:p-6 print:p-0">
      <div className="print-hidden flex flex-col gap-3">
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
                <Link href="/bikes">Bikes</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>QR sticker sheet</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              QR sticker sheet
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {bikes.length} {bikes.length === 1 ? "bike" : "bikes"} on this
              sheet. A4-fits 3×8 cells; print at 100% scale.
            </p>
          </div>
          <PrintButton />
        </div>
      </div>

      {qrs.length === 0 ? (
        <p className="text-muted-foreground text-center text-sm">
          No bikes match the requested ids.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-3 print:gap-2">
          {qrs.map(({ bike, svg }) => {
            const tplLabel = bike.template
              ? [bike.template.family, bike.template.frame_size]
                  .filter(Boolean)
                  .join(" · ")
              : "";
            return (
              <div
                key={bike.id}
                className="flex flex-col items-center gap-1 break-inside-avoid rounded-md border bg-white p-3 print:border print:border-black/20"
              >
                <div
                  // Same intrinsic-SVG-size fix as /qr/[bikeId]/page.tsx.
                  className="w-full max-w-[160px] [&>svg]:h-auto [&>svg]:w-full"
                  dangerouslySetInnerHTML={{ __html: svg }}
                />
                <p className="font-mono text-[10px] sm:text-xs">
                  {bike.frame_number}
                </p>
                {tplLabel ? (
                  <p className="text-muted-foreground text-[9px] sm:text-[10px]">
                    {tplLabel}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
