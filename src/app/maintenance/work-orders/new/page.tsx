import Link from "next/link";
import { getTranslations } from "next-intl/server";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

import { loadWOPickables } from "../_components/load-pickables";
import { WOForm } from "../_components/wo-form";

type SearchParams = {
  bike?: string;
  ticket?: string;
};

export default async function NewWorkOrderPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const [t, tCommon, tMaint] = await Promise.all([
    getTranslations("workOrders"),
    getTranslations("common"),
    getTranslations("maintenance"),
  ]);
  const { bikes, tickets } = await loadWOPickables();

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
              <Link href="/maintenance/tickets">{tMaint("crumb")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/maintenance/work-orders">{t("title")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("crumbNew")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("newWorkOrder")}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("newSubtitle")}</p>
      </div>
      <WOForm
        initial={{
          bike_id: sp.bike ?? "",
          // Omitted when there is no ?ticket — the form's own default is the
          // "no ticket" sentinel, which only it knows about.
          ...(sp.ticket ? { ticket_id: sp.ticket } : {}),
        }}
        bikes={bikes}
        tickets={tickets}
      />
    </div>
  );
}
