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
import { CAPABILITIES } from "@/lib/people/capabilities";
import {
  NOTIFICATION_EVENTS,
  NOTIFICATION_EVENT_LABEL_KEYS,
} from "@/lib/people/notifications";

import { EMPTY_ROLE_FORM, RoleForm } from "../../_components/role-form";

export default async function NewRolePage() {
  const [t, tNav] = await Promise.all([
    getTranslations("adminPeople"),
    getTranslations("nav"),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4 sm:p-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/admin">{t("crumbAdmin")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/admin/people">{t("crumb")}</Link>
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
          {t("newRole")}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {t("roleNewSubtitle")}
        </p>
      </div>

      <RoleForm
        mode={{ kind: "create" }}
        initial={EMPTY_ROLE_FORM}
        capabilityOptions={CAPABILITIES.map((c) => ({
          key: c.key,
          label: c.navLabelKey ? tNav(c.navLabelKey) : t("capScan"),
        }))}
        eventOptions={NOTIFICATION_EVENTS.map((e) => ({
          key: e,
          label: t(NOTIFICATION_EVENT_LABEL_KEYS[e]),
        }))}
      />
    </div>
  );
}
