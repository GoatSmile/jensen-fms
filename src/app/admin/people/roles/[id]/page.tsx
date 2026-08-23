import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { localizedName } from "@/i18n/vocab";
import { CAPABILITIES } from "@/lib/people/capabilities";
import {
  NOTIFICATION_EVENTS,
  NOTIFICATION_EVENT_LABEL_KEYS,
} from "@/lib/people/notifications";
import { createClient } from "@/lib/supabase/server";

import { RoleForm } from "../../_components/role-form";

export default async function EditRolePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const [t, tNav, locale] = await Promise.all([
    getTranslations("adminPeople"),
    getTranslations("nav"),
    getLocale(),
  ]);

  const [roleRes, capsRes, eventsRes] = await Promise.all([
    supabase
      .from("roles")
      .select("id, key, name_en, name_da, home_path, sort_order, is_active")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("role_capabilities").select("capability").eq("role_id", id),
    supabase.from("role_notifications").select("event_key").eq("role_id", id),
  ]);

  if (roleRes.error) {
    throw new Error(`Failed to load role: ${roleRes.error.message}`);
  }
  const role = roleRes.data;
  if (!role) notFound();

  const name = localizedName(locale, role.name_en, role.name_da);

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
            <BreadcrumbPage>{name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {t("roleEditSubtitle")}
        </p>
      </div>

      <RoleForm
        mode={{ kind: "edit", id: role.id }}
        initial={{
          key: role.key,
          name_en: role.name_en,
          name_da: role.name_da ?? "",
          home_path: role.home_path,
          sort_order: String(role.sort_order),
          is_active: role.is_active,
          capabilities: (capsRes.data ?? []).map((c) => c.capability),
          events: (eventsRes.data ?? []).map((e) => e.event_key),
        }}
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
