import Link from "next/link";
import { notFound } from "next/navigation";
import { Bike } from "lucide-react";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

import { ReportForm } from "./_components/report-form";

export const dynamic = "force-dynamic";

/**
 * Public bike landing page. Reached by scanning a Jensen QR sticker.
 *
 * The page serves two audiences from one URL:
 *   - Customers: see a friendly summary of their bike and a "Report a
 *     problem" form. No auth required.
 *   - Staff: see the same summary, plus an "Open in Jensen FMS" link
 *     that goes to /bikes/<id> (workshop view). Auth gating on that
 *     link arrives with M1; for now both audiences can click through.
 *
 * Non-sensitive bike info only: template, frame number, owner name.
 * Pricing, parts list, lifecycle log, customer contacts — all stay on
 * the workshop side.
 */
export default async function PublicBikePage({
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
       template:bike_templates(id, name_en, family, frame_size),
       bike_type:bike_types(name_en),
       color:colors(name_en, hex),
       owner_organization:organizations!owner_organization_id(
         id, legal_name, display_name_en, display_name_da
       )`,
    )
    .eq("id", bikeId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error(`Failed to load bike: ${error.message}`);
  if (!bike) notFound();

  const templateLabel = bike.template
    ? [bike.template.family, bike.template.frame_size, bike.template.name_en]
        .filter(Boolean)
        .join(" · ")
    : null;
  const ownerName =
    bike.owner_organization?.display_name_da ??
    bike.owner_organization?.display_name_en ??
    bike.owner_organization?.legal_name ??
    null;

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-col items-center gap-3 pt-2 text-center">
        <Logo heightClass="h-12" />
        <p className="text-muted-foreground text-xs">Kvalitetscykler</p>
      </header>

      <section className="flex flex-col items-center gap-1.5 rounded-lg border bg-muted/20 p-5 text-center">
        <Bike className="text-muted-foreground size-6" aria-hidden />
        <h1 className="text-xl font-semibold tracking-tight">
          {templateLabel ?? "Jensen bike"}
        </h1>
        <p className="text-muted-foreground font-mono text-xs">
          {bike.frame_number}
        </p>
        {bike.color ? (
          <p className="text-muted-foreground text-xs">
            {bike.color.name_en}
          </p>
        ) : null}
        {ownerName ? (
          <p className="text-muted-foreground text-xs">{ownerName}</p>
        ) : null}
      </section>

      <section className="flex flex-col gap-4 rounded-lg border bg-card p-4 sm:p-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">Report a problem</h2>
          <p className="text-muted-foreground text-sm">
            Tell us what&rsquo;s wrong. Adding a photo helps us prepare the
            right parts.
          </p>
        </div>
        <ReportForm bikeId={bike.id} frameNumber={bike.frame_number} />
      </section>

      <div className="text-muted-foreground flex justify-center pt-2 text-xs">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/bikes/${bike.id}`}>Staff: open in Jensen FMS →</Link>
        </Button>
      </div>
    </div>
  );
}
