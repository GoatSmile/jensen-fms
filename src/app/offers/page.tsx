import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { FileText, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Panel } from "@/components/ui/panel";
import { SegmentedId } from "@/components/segmented-id";
import { EmptyState } from "@/components/empty-state";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/parts/format";
import { formatPrice } from "@/lib/format";
import {
  OFFER_STATUS_VARIANT,
  isExpired,
  type OfferStatus,
} from "@/lib/offers/status";

export const dynamic = "force-dynamic";

export default async function OffersListPage() {
  const [t, tCommon, tStatus] = await Promise.all([
    getTranslations("offers"),
    getTranslations("common"),
    getTranslations("offerStatus"),
  ]);
  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from("offers")
    .select(
      `id, offer_number, status, revision, issued_date, expiry_date,
       total_amount, currency,
       organization:organizations!organization_id(id, legal_name, display_name_en, display_name_da)`,
    )
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load offers: ${error.message}`);
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">{tCommon("crumbDashboard")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("title")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
        </div>
        <Button asChild>
          <Link href="/offers/new">
            <Plus aria-hidden /> {t("newOffer")}
          </Link>
        </Button>
      </div>

      {!rows || rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={t("emptyTitle")}
          description={t("emptyDesc")}
          action={{ label: t("newOffer"), href: "/offers/new" }}
        />
      ) : (
        <Panel>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("thOffer")}</TableHead>
                <TableHead>{t("thCustomer")}</TableHead>
                <TableHead>{t("thStatus")}</TableHead>
                <TableHead className="hidden md:table-cell">
                  {t("thIssued")}
                </TableHead>
                <TableHead className="hidden lg:table-cell">
                  {t("thExpiry")}
                </TableHead>
                <TableHead className="text-right">{t("thTotal")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((offer) => {
                const customer =
                  offer.organization?.display_name_da ??
                  offer.organization?.display_name_en ??
                  offer.organization?.legal_name ??
                  "—";
                const status = offer.status as OfferStatus;
                // Expired is DERIVED — nothing stores it, and an offer only
                // wears it while it is still live (see lib/offers/status.ts).
                const shown: OfferStatus = isExpired(status, offer.expiry_date)
                  ? "expired"
                  : status;
                return (
                  <TableRow key={offer.id} className="hover:bg-muted/50">
                    <TableCell className="p-0 text-xs">
                      <Link
                        href={`/offers/${offer.id}`}
                        className="block px-4 py-2.5 hover:underline"
                      >
                        <SegmentedId value={offer.offer_number} />
                        {offer.revision > 1 ? (
                          <span className="text-muted-foreground ml-1.5">
                            {t("revShort", { n: offer.revision })}
                          </span>
                        ) : null}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/offers/${offer.id}`}
                        className="block px-4 py-2.5 text-sm hover:underline"
                      >
                        {customer}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant={OFFER_STATUS_VARIANT[shown] ?? "outline"}>
                        {tStatus.has(shown) ? tStatus(shown) : shown}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden text-xs md:table-cell">
                      {formatDate(offer.issued_date)}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden text-xs lg:table-cell">
                      {formatDate(offer.expiry_date)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {offer.total_amount != null
                        ? formatPrice(Number(offer.total_amount), offer.currency)
                        : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Panel>
      )}
    </div>
  );
}
