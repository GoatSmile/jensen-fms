import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { FileSignature } from "lucide-react";

import { UploadAgreementButton } from "@/components/agreements/upload-agreement-button";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/parts/format";
import {
  SA_STATUS_VARIANT,
  type ServiceAgreementStatus,
} from "@/lib/service-agreements/status";
import { createClient } from "@/lib/supabase/server";

/**
 * This customer's service agreements, and the door for a signed paper
 * (migration 110): *Upload agreement* takes photos or a PDF from Dennis's
 * phone, the system reads it, and he confirms which agreement and which bikes
 * on the review page. Papers read but not yet confirmed are listed first —
 * they are work waiting for him.
 *
 * Shown only to holders of `agreements` (the page itself is `customers`).
 */
export async function CustomerAgreementsSection({
  organizationId,
}: {
  organizationId: string;
}) {
  const [t, tStatus] = await Promise.all([
    getTranslations("agreementDocs"),
    getTranslations("saStatus"),
  ]);
  const supabase = await createClient();

  const [agreementsRes, docsRes] = await Promise.all([
    supabase
      .from("service_agreements")
      .select(
        "id, name_en, name_da, status, contract_type, signed_on, start_date, unit:organization_units!organization_unit_id(name)",
      )
      .eq("organization_id", organizationId)
      .order("start_date", { ascending: false }),
    supabase
      .from("service_agreement_documents")
      .select("id, status, created_at")
      .eq("organization_id", organizationId)
      .neq("status", "confirmed")
      .order("created_at", { ascending: false }),
  ]);

  if (agreementsRes.error || docsRes.error) {
    return (
      <Panel title={t("customerTitle")}>
        <p className="rounded-lg bg-ground p-4 text-sm text-alert">{t("customerLoadFailed")}</p>
      </Panel>
    );
  }
  const agreements = agreementsRes.data ?? [];
  const docs = docsRes.data ?? [];

  const ids = agreements.map((a) => a.id);
  const { data: lines } = ids.length
    ? await supabase
        .from("service_agreement_bikes")
        .select("agreement_id")
        .eq("status", "active")
        .in("agreement_id", ids)
    : { data: [] as { agreement_id: string }[] };
  const bikeCount = new Map<string, number>();
  for (const l of lines ?? []) bikeCount.set(l.agreement_id, (bikeCount.get(l.agreement_id) ?? 0) + 1);

  return (
    <Panel
      title={t("customerTitle")}
      description={t("customerDesc")}
      action={<UploadAgreementButton organizationId={organizationId} />}
      contentClassName="flex flex-col gap-4"
    >
      {docs.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {docs.map((d) => (
            <li key={d.id} className="bg-ground flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm">
              <span className="flex items-center gap-2">
                <FileSignature className="text-muted-foreground size-4" aria-hidden />
                {t("docUploaded", { date: formatDate(d.created_at.slice(0, 10)) })}
                <Badge variant={d.status === "failed" ? "destructive" : "warning"}>
                  {t(`docStatus.${d.status}`)}
                </Badge>
              </span>
              <Link href={`/service-agreements/documents/${d.id}`} className="font-medium hover:underline">
                {t("review")}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {agreements.length === 0 ? (
        <EmptyState
          inPanel
          icon={FileSignature}
          title={t("customerEmptyTitle")}
          description={t("customerEmptyDesc")}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("colAgreement")}</TableHead>
              <TableHead>{t("colDepartment")}</TableHead>
              <TableHead>{t("colType")}</TableHead>
              <TableHead>{t("colSigned")}</TableHead>
              <TableHead className="text-right">{t("colBikes")}</TableHead>
              <TableHead>{t("colStatus")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {agreements.map((a) => {
              const unit = Array.isArray(a.unit) ? a.unit[0] : a.unit;
              return (
                <TableRow key={a.id}>
                  <TableCell>
                    <Link href={`/service-agreements/${a.id}`} className="font-medium hover:underline">
                      {a.name_da ?? a.name_en}
                    </Link>
                  </TableCell>
                  <TableCell>{unit?.name ?? t("wholeCustomer")}</TableCell>
                  <TableCell>{a.contract_type ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell>
                    {a.signed_on ? formatDate(a.signed_on) : <span className="text-muted-foreground">{t("verbal")}</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{bikeCount.get(a.id) ?? 0}</TableCell>
                  <TableCell>
                    <Badge variant={SA_STATUS_VARIANT[a.status as ServiceAgreementStatus] ?? "outline"}>
                      {tStatus.has(a.status) ? tStatus(a.status) : a.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Panel>
  );
}
