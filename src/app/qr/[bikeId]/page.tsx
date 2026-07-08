import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, Printer } from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { bikeStickerUrl, qrSvg } from "@/lib/qr";

export const dynamic = "force-dynamic";

/**
 * Single-bike QR view. Shows the code at a workshop-readable size, the
 * encoded URL beneath it, and two CTAs:
 *
 *   - Download SVG (scales to any sticker dimension without losing quality)
 *   - Print sticker (opens the print route for this one bike)
 *
 * The QR is server-rendered to SVG inline so view-source has the markup
 * and there's no extra round trip. A separate /api/qr/<id>.svg endpoint
 * would be cleaner for the download button, but the inline-SVG-to-blob
 * trick in the client component avoids the extra route until we need it.
 */
export default async function BikeQRPage({
  params,
}: {
  params: Promise<{ bikeId: string }>;
}) {
  const { bikeId } = await params;
  const supabase = await createClient();

  const { data: bike, error } = await supabase
    .from("bikes")
    .select(
      `id, frame_number, status,
       template:bike_templates(id, name_en, family:bike_families(name), frame_size),
       bike_type:bike_types(id, name_en),
       owner_organization:organizations!owner_organization_id(
         id, legal_name, display_name_en, display_name_da
       )`,
    )
    .eq("id", bikeId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load bike: ${error.message}`);
  if (!bike) notFound();

  const url = bikeStickerUrl(bike.id);
  const svg = await qrSvg(url, { width: 512, margin: 2 });

  const templateLabel = bike.template
    ? [bike.template.family?.name, bike.template.frame_size, bike.template.name_en]
        .filter(Boolean)
        .join(" · ")
    : null;
  const ownerName =
    bike.owner_organization?.display_name_da ??
    bike.owner_organization?.display_name_en ??
    bike.owner_organization?.legal_name ??
    null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-4 sm:p-6">
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
            <BreadcrumbLink asChild>
              <Link
                href={`/bikes/${bike.id}`}
                className="font-mono"
              >
                {bike.frame_number}
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>QR sticker</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">QR sticker</h1>
        <p className="text-muted-foreground text-sm">
          Print or download. Scanning the code lands on a public page where
          customers can report a problem; staff can open the full bike
          detail from there.
        </p>
      </div>

      <section className="flex flex-col items-center gap-4 rounded-lg border bg-white p-6 print:border-0 print:p-0">
        <div
          // The inner <svg> from the qrcode package carries its own intrinsic
          // width/height; force it to scale to the wrapper instead so it
          // doesn't overflow into the labels below.
          className="size-64 sm:size-80 [&>svg]:h-full [&>svg]:w-full"
          // The QR is just SVG; we trust our own output.
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <div className="flex flex-col items-center gap-1 text-center">
          <p className="text-muted-foreground font-mono text-xs sm:text-sm">
            {url}
          </p>
          <p className="font-medium">
            {bike.frame_number}
          </p>
          {templateLabel ? (
            <p className="text-muted-foreground text-xs">{templateLabel}</p>
          ) : null}
          {ownerName ? (
            <p className="text-muted-foreground text-xs">{ownerName}</p>
          ) : null}
        </div>
      </section>

      <div className="flex flex-wrap gap-2 print-hidden">
        <Button variant="outline" asChild>
          <a
            href={`/api/qr/${bike.id}.svg`}
            download={`${bike.frame_number}.svg`}
          >
            <Download aria-hidden /> Download SVG
          </a>
        </Button>
        <Button variant="outline" asChild>
          <a
            href={`/api/qr/${bike.id}.png`}
            download={`${bike.frame_number}.png`}
          >
            <Download aria-hidden /> Download PNG
          </a>
        </Button>
        <Button asChild>
          <Link href={`/qr/print?bikes=${bike.id}`}>
            <Printer aria-hidden /> Print sheet
          </Link>
        </Button>
      </div>
    </div>
  );
}
