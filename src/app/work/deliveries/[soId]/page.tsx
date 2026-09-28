import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { PrintButton } from "@/app/parts/print/_components/print-button";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { DELIVERY_NOTE_LABELS, loadDeliveryNote } from "@/lib/so/delivery-note";

import { SignDeliveryForm } from "./_components/sign-delivery-form";

export const dynamic = "force-dynamic";

/**
 * One delivery note (*følgeseddel*): what is handed over — bikes by frame
 * number and code, parts by name, NO prices — to whom and where. The note
 * itself is in the ORDER's language (the customer reads it); the controls
 * around it follow the viewer's. The recipient signs below while the order is
 * `ready`; once signed, the note shows who received it, when, and the
 * signature, and it prints for the office's file.
 */
export default async function DeliveryNotePage({
  params,
}: {
  params: Promise<{ soId: string }>;
}) {
  const { soId } = await params;
  const t = await getTranslations("deliveries");
  const supabase = await createClient();
  const note = await loadDeliveryNote(supabase, soId);
  if (!note) notFound();
  const L = DELIVERY_NOTE_LABELS[note.language];

  // The signature is in a private bucket: a short-lived link, made here.
  let signatureUrl: string | null = null;
  if (note.hasSignature) {
    const { data: so } = await supabase
      .from("sales_orders")
      .select("delivery_signature_path")
      .eq("id", soId)
      .maybeSingle();
    if (so?.delivery_signature_path) {
      const { data } = await createServiceClient()
        .storage.from("signatures")
        .createSignedUrl(so.delivery_signature_path, 600);
      signatureUrl = data?.signedUrl ?? null;
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-2 print:hidden">
        <Button asChild variant="ghost" size="sm">
          <Link href="/work/deliveries">
            <ArrowLeft className="mr-1 size-4" aria-hidden /> {t("backToList")}
          </Link>
        </Button>
        {note.signedAt ? <PrintButton /> : null}
      </div>

      <Panel contentClassName="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground font-mono text-xs">
            {L.order} {note.soNumber}
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">{L.title}</h1>
        </div>

        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Row label={L.customer} value={note.customer} />
          {note.unit ? <Row label={L.department} value={note.unit} /> : null}
          <Row label={L.contact} value={note.contactName ?? L.none} />
          <Row label={L.phone} value={note.contactPhone ?? L.none} />
          <div className="sm:col-span-2">
            <Row label={L.address} value={note.address ?? L.none} />
          </div>
        </dl>

        {note.bikes.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h2 className="text-ink-2 text-xs font-bold tracking-[0.075em] uppercase">
              {L.bikes} ({note.bikes.length})
            </h2>
            <ul className="divide-rule divide-y">
              {note.bikes.map((b) => (
                <li key={b.id} className="flex flex-wrap items-baseline gap-x-3 py-2 text-sm">
                  {b.recognitionCode ? (
                    <span className="bg-muted rounded px-1.5 py-0.5 font-mono font-semibold">
                      {b.recognitionCode}
                    </span>
                  ) : null}
                  <span className="font-mono">{b.frameNumber}</span>
                  <span className="text-muted-foreground">
                    {[b.template, b.colour].filter(Boolean).join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {note.parts.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h2 className="text-ink-2 text-xs font-bold tracking-[0.075em] uppercase">
              {L.parts}
            </h2>
            <ul className="divide-rule divide-y">
              {note.parts.map((p, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                  <span>
                    {p.name}
                    {p.sku ? (
                      <span className="text-muted-foreground ml-2 font-mono text-xs">
                        {p.sku}
                      </span>
                    ) : null}
                  </span>
                  <span className="tabular-nums">× {p.quantity}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {note.signedAt ? (
          <section className="flex flex-col gap-2">
            <h2 className="text-ink-2 text-xs font-bold tracking-[0.075em] uppercase">
              {L.signHere}
            </h2>
            {signatureUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={signatureUrl}
                alt={L.signHere}
                className="border-rule h-32 w-auto self-start rounded border bg-white"
              />
            ) : null}
            <p className="text-sm">
              {L.signedBy}: <strong>{note.signedBy}</strong> ·{" "}
              {L.signedAt}:{" "}
              {new Date(note.signedAt).toLocaleString(
                note.language === "da" ? "da-DK" : "en-GB",
                { dateStyle: "medium", timeStyle: "short" },
              )}
            </p>
          </section>
        ) : null}
      </Panel>

      {note.status === "ready" ? (
        <div className="print:hidden">
          <SignDeliveryForm
            soId={note.soId}
            labels={{ signHere: L.signHere, signerName: L.signerName }}
            defaultSigner={note.contactName ?? ""}
          />
        </div>
      ) : !note.signedAt ? (
        <p className="bg-surface text-ink-2 rounded-lg p-3 text-sm print:hidden">
          {t("notReady")}
        </p>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
