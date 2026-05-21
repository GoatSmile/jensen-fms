import Link from "next/link";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

import { loadWOPickables } from "../_components/load-pickables";
import { EMPTY_WO_FORM, WOForm } from "../_components/wo-form";

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
  const { bikes, tickets } = await loadWOPickables();

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
              <Link href="/maintenance/tickets">Maintenance</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/maintenance/work-orders">Work orders</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>New</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          New work order
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Standalone work orders are rare — most are spawned from a ticket via
          the &ldquo;Start work order&rdquo; button. Use this when the work
          doesn&apos;t correspond to a logged customer report.
        </p>
      </div>
      <WOForm
        initial={{
          ...EMPTY_WO_FORM,
          bike_id: sp.bike ?? "",
          ticket_id: sp.ticket ?? EMPTY_WO_FORM.ticket_id,
        }}
        bikes={bikes}
        tickets={tickets}
      />
    </div>
  );
}
