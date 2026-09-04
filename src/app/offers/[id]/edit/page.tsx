import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { createClient } from "@/lib/supabase/server";
import { isOfferEditable, type OfferStatus } from "@/lib/offers/status";

import { OfferForm } from "../../_components/offer-form";
import { loadOfferFormOptions } from "../../_components/load-options";

export default async function EditOfferPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [t, tCommon] = await Promise.all([
    getTranslations("offers"),
    getTranslations("common"),
  ]);
  const supabase = await createClient();

  const { data: offer } = await supabase
    .from("offers")
    .select(
      "id, offer_number, status, organization_id, organization_unit_id, contact_id, language, currency, expiry_date, notes",
    )
    .eq("id", id)
    .maybeSingle();
  if (!offer) notFound();

  // Past draft the customer is holding the document; the way to change it is
  // to reopen it for revision, which the detail page offers.
  if (!isOfferEditable(offer.status as OfferStatus)) {
    redirect(`/offers/${id}`);
  }

  const { organizations, units, contacts, currencies } =
    await loadOfferFormOptions(supabase, t("noName"));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-4 sm:p-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">{tCommon("crumbDashboard")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/offers">{t("title")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={`/offers/${id}`}>{offer.offer_number}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("crumbEdit")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div>
        <h1 className="text-2xl font-semibold">
          {t("editTitle", { number: offer.offer_number })}
        </h1>
      </div>

      <OfferForm
        mode="edit"
        offerId={id}
        initial={{
          organization_id: offer.organization_id,
          organization_unit_id: offer.organization_unit_id ?? "",
          contact_id: offer.contact_id ?? "",
          language: offer.language === "en" ? "en" : "da",
          currency: offer.currency,
          expiry_date: offer.expiry_date ?? "",
          notes: offer.notes ?? "",
        }}
        organizations={organizations}
        units={units}
        contacts={contacts}
        currencies={currencies}
      />
    </div>
  );
}
