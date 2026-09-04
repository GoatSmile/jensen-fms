import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { FileText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { Panel } from "@/components/ui/panel";
import { SegmentedId } from "@/components/segmented-id";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/parts/format";
import { formatPrice } from "@/lib/format";
import {
  OFFER_STATUS_VARIANT,
  isExpired,
  type OfferStatus,
} from "@/lib/offers/status";

/**
 * This customer's offers — INCLUDING the declined ones, which is the whole
 * point of the panel. Dennis, 3 September: *"if they decide no, it will just
 * stay in the system as an offer for this customer."* A quote that vanished on
 * rejection could not come back when the customer did.
 */
export async function CustomerOffersSection({
  organizationId,
}: {
  organizationId: string;
}) {
  const [t, tStatus] = await Promise.all([
    getTranslations("offers"),
    getTranslations("offerStatus"),
  ]);
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("offers")
    .select(
      "id, offer_number, status, revision, issued_date, expiry_date, total_amount, currency",
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  return (
    <Panel title={t("title")} description={t("customerPanelDesc")}>
      {!rows || rows.length === 0 ? (
        <EmptyState
          inPanel
          icon={FileText}
          title={t("customerEmptyTitle")}
          description={t("customerEmptyDesc")}
          action={{ label: t("newOffer"), href: "/offers/new" }}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("thOffer")}</TableHead>
              <TableHead>{t("thStatus")}</TableHead>
              <TableHead className="hidden md:table-cell">
                {t("thIssued")}
              </TableHead>
              <TableHead className="text-right">{t("thTotal")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((offer) => {
              const status = offer.status as OfferStatus;
              const shown: OfferStatus = isExpired(status, offer.expiry_date)
                ? "expired"
                : status;
              return (
                <TableRow key={offer.id} className="hover:bg-muted/50">
                  <TableCell className="text-xs">
                    <Link
                      href={`/offers/${offer.id}`}
                      className="hover:underline"
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
                    <Badge variant={OFFER_STATUS_VARIANT[shown] ?? "outline"}>
                      {tStatus.has(shown) ? tStatus(shown) : shown}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden text-xs md:table-cell">
                    {formatDate(offer.issued_date)}
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
      )}
    </Panel>
  );
}
