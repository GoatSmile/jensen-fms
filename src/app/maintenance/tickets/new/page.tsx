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

import { loadTicketPickables } from "../_components/load-pickables";
import { EMPTY_TICKET_FORM, TicketForm } from "../_components/ticket-form";

type SearchParams = {
  bike?: string;
};

export default async function NewTicketPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const [t, tCommon] = await Promise.all([
    getTranslations("tickets"),
    getTranslations("common"),
  ]);
  const { bikes, contacts } = await loadTicketPickables();

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
              <Link href="/maintenance/tickets">{t("title")}</Link>
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
          {t("newTicket")}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {t("newSubtitle")}
        </p>
      </div>
      <TicketForm
        initial={{
          ...EMPTY_TICKET_FORM,
          bike_id: sp.bike ?? "",
        }}
        bikes={bikes}
        contacts={contacts}
        mode={{ kind: "create" }}
      />
    </div>
  );
}
