import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/parts/format";
import {
  matchFrames,
  type ActiveLineInfo,
  type MatchBike,
} from "@/lib/service-agreements/documents/match";
import { parseAgreementReading } from "@/lib/service-agreements/documents/reading";
import {
  AGREEMENT_DOCUMENTS_BUCKET,
  AGREEMENT_DOCUMENT_ENTITY,
} from "@/lib/service-agreements/documents/storage";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { createServiceClient } from "@/lib/supabase/service";

import { DocumentPages, type PageView } from "./_components/document-pages";
import { DocumentReview } from "./_components/document-review";
import { ReadNow } from "./_components/read-now";

export const dynamic = "force-dynamic";

/** Pages are shown through short-lived signed URLs — the bucket is private. */
const PAGE_URL_TTL_SECONDS = 3600;

/**
 * Review a signed agreement (migration 110): the pages on one side, what the
 * model read on the other, every frame number matched to a bike by CODE — and
 * nothing written until Dennis presses *Confirm*. Under /service-agreements,
 * so the route needs `agreements`.
 */
export default async function AgreementDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [t, tList] = await Promise.all([
    getTranslations("agreementDocs"),
    getTranslations("serviceAgreements"),
  ]);
  // Service client: the pages sit in a private bucket, and one query set
  // reads storage and tables alike.
  const supabase = createServiceClient();

  const { data: doc, error } = await supabase
    .from("service_agreement_documents")
    .select(
      `id, status, reading, read_error, read_at, read_model, organization_id, agreement_id,
       confirmed_at, created_at,
       confirmer:people!confirmed_by(full_name),
       organization:organizations!organization_id(legal_name, display_name_da, display_name_en)`,
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load document: ${error.message}`);
  if (!doc) notFound();

  const org = Array.isArray(doc.organization) ? doc.organization[0] : doc.organization;
  const orgName = org?.display_name_da ?? org?.display_name_en ?? org?.legal_name ?? "—";
  const confirmer = Array.isArray(doc.confirmer) ? doc.confirmer[0] : doc.confirmer;

  const { data: attachments } = await supabase
    .from("attachments")
    .select("id, file_url, file_name, mime_type")
    .eq("entity_type", AGREEMENT_DOCUMENT_ENTITY)
    .eq("entity_id", id)
    .is("deleted_at", null)
    .order("file_url");
  const pages: PageView[] = [];
  for (const a of attachments ?? []) {
    const { data } = await supabase.storage
      .from(AGREEMENT_DOCUMENTS_BUCKET)
      .createSignedUrl(a.file_url, PAGE_URL_TTL_SECONDS);
    pages.push({
      id: a.id,
      url: data?.signedUrl ?? null,
      name: a.file_name,
      isPdf: a.mime_type === "application/pdf",
    });
  }

  const reading = parseAgreementReading(doc.reading);

  const header = (
    <>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/service-agreements">{tList("title")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={`/organizations/${doc.organization_id}`}>{orgName}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("reviewCrumb")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold">{t("reviewTitle", { customer: orgName })}</h1>
        <Badge
          variant={
            doc.status === "confirmed" ? "success" : doc.status === "failed" ? "destructive" : "warning"
          }
        >
          {t(`docStatus.${doc.status}`)}
        </Badge>
      </div>
    </>
  );

  // ---- after confirmation: what it became, read-only.
  if (doc.status === "confirmed") {
    const { data: lines } = await supabase
      .from("service_agreement_bikes")
      .select("id, bike:bikes!bike_id(id, frame_number)")
      .eq("document_id", id)
      .order("created_at");
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        {header}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <DocumentPages pages={pages} />
          <div className="bg-good-wash flex flex-col gap-3 rounded-2xl p-5 text-sm">
            <p>
              {t("confirmedBy", {
                who: confirmer?.full_name ?? "—",
                when: formatDateTime(doc.confirmed_at),
              })}
            </p>
            {doc.agreement_id ? (
              <Link href={`/service-agreements/${doc.agreement_id}`} className="font-medium hover:underline">
                {t("openAgreement")}
              </Link>
            ) : null}
            <p className="text-muted-foreground">{t("linesFromDoc", { count: lines?.length ?? 0 })}</p>
            <div className="flex flex-wrap gap-1.5">
              {(lines ?? []).map((l) => {
                const b = Array.isArray(l.bike) ? l.bike[0] : l.bike;
                return b ? (
                  <Link
                    key={l.id}
                    href={`/bikes/${b.id}`}
                    className="bg-surface hover:bg-muted rounded-md px-2 py-1 font-mono text-xs"
                  >
                    {b.frame_number}
                  </Link>
                ) : null;
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- before confirmation: match and propose.
  const [agreementsRes, unitsRes, bikesRes, linesRes] = await Promise.all([
    supabase
      .from("service_agreements")
      .select("id, name_en, name_da, status, organization_unit_id, contract_type")
      .eq("organization_id", doc.organization_id)
      .order("start_date", { ascending: false }),
    supabase
      .from("organization_units")
      .select("id, name")
      .eq("organization_id", doc.organization_id)
      .is("deleted_at", null)
      .order("name"),
    fetchAllRows<{
      id: string;
      frame_number: string;
      status: string;
      owner_organization_id: string | null;
      owner_unit_id: string | null;
      owner: { legal_name: string; display_name_da: string | null } | null;
    }>((from, to) =>
      supabase
        .from("bikes")
        .select(
          "id, frame_number, status, owner_organization_id, owner_unit_id, owner:organizations!owner_organization_id(legal_name, display_name_da)",
        )
        .is("deleted_at", null)
        .order("id")
        .range(from, to) as unknown as PromiseLike<{
        data: {
          id: string;
          frame_number: string;
          status: string;
          owner_organization_id: string | null;
          owner_unit_id: string | null;
          owner: { legal_name: string; display_name_da: string | null } | null;
        }[] | null;
        error: { message: string } | null;
      }>,
    ),
    fetchAllRows<{
      id: string;
      bike_id: string;
      agreement_id: string;
      agreement: { name_en: string; name_da: string | null } | null;
    }>((from, to) =>
      supabase
        .from("service_agreement_bikes")
        .select("id, bike_id, agreement_id, agreement:service_agreements!agreement_id(name_en, name_da)")
        .eq("status", "active")
        .order("id")
        .range(from, to) as unknown as PromiseLike<{
        data: {
          id: string;
          bike_id: string;
          agreement_id: string;
          agreement: { name_en: string; name_da: string | null } | null;
        }[] | null;
        error: { message: string } | null;
      }>,
    ),
  ]);
  if (bikesRes.error) throw new Error(`Failed to load bikes: ${bikesRes.error}`);
  if (linesRes.error) throw new Error(`Failed to load agreement lines: ${linesRes.error}`);

  const bikes: MatchBike[] = bikesRes.data.map((b) => {
    const owner = Array.isArray(b.owner) ? b.owner[0] : b.owner;
    return {
      id: b.id,
      frame_number: b.frame_number,
      status: b.status,
      owner_organization_id: b.owner_organization_id,
      owner_unit_id: b.owner_unit_id,
      owner_name: owner ? (owner.display_name_da ?? owner.legal_name) : null,
    };
  });
  const activeLines = new Map<string, ActiveLineInfo>();
  for (const l of linesRes.data) {
    const a = Array.isArray(l.agreement) ? l.agreement[0] : l.agreement;
    activeLines.set(l.bike_id, {
      line_id: l.id,
      agreement_id: l.agreement_id,
      agreement_name: a ? (a.name_da ?? a.name_en) : "—",
    });
  }
  const matches = matchFrames(reading.frames, bikes, activeLines, doc.organization_id);

  const units = unitsRes.data ?? [];
  const agreements = (agreementsRes.data ?? []).map((a) => ({
    id: a.id,
    name: a.name_da ?? a.name_en,
    status: a.status,
    unitId: a.organization_unit_id,
    unitName: units.find((u) => u.id === a.organization_unit_id)?.name ?? null,
    contractType: a.contract_type,
  }));

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      {header}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <DocumentPages pages={pages} />
        {doc.status === "uploaded" ? (
          <ReadNow documentId={id} />
        ) : (
          <DocumentReview
            // A re-read must reseed the form, not keep the old proposal.
            key={doc.read_at ?? "unread"}
            documentId={id}
            organizationId={doc.organization_id}
            organizationName={orgName}
            status={doc.status as "read" | "failed"}
            readError={doc.read_error}
            readAt={doc.read_at}
            reading={reading}
            matches={matches}
            agreements={agreements}
            units={units}
            presetAgreementId={doc.agreement_id}
          />
        )}
      </div>
    </div>
  );
}
