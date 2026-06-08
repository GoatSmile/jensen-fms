import Link from "next/link";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { createClient } from "@/lib/supabase/server";

import {
  EMPTY_AGREEMENT,
  ServiceAgreementForm,
  type OrgOption,
  type UnitOption,
} from "../_components/service-agreement-form";
import { loadPickers } from "../_lib/pickers";

export const dynamic = "force-dynamic";

export default async function NewServiceAgreementPage() {
  const supabase = await createClient();
  const { organizations, units } = await loadPickers(supabase);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
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
              <Link href="/service-agreements">Service agreements</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>New</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">New service agreement</h1>
        <p className="text-muted-foreground text-sm">
          Record a coverage agreement for a customer (or one of their units).
        </p>
      </div>

      <div className="max-w-3xl">
        <ServiceAgreementForm
          mode="create"
          initial={EMPTY_AGREEMENT}
          organizations={organizations as OrgOption[]}
          units={units as UnitOption[]}
        />
      </div>
    </div>
  );
}
