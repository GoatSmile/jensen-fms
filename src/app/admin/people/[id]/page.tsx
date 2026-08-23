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
import { createClient } from "@/lib/supabase/server";

import { PersonForm } from "../_components/person-form";
import { PersonPasswordCard } from "../_components/person-password-card";

export default async function EditPersonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const [t, locale] = await Promise.all([
    getTranslations("adminPeople"),
    getLocale(),
  ]);

  const [personRes, rolesRes, personRolesRes] = await Promise.all([
    supabase
      .from("people")
      .select(
        "id, full_name, email, phone, preferred_language, engaged_from, engaged_until, notify_email, notify_sms, notes, is_active, is_system, password_hash",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("roles")
      .select("id, name_en, name_da, is_active")
      .order("sort_order", { ascending: true }),
    supabase.from("person_roles").select("role_id").eq("person_id", id),
  ]);

  if (personRes.error) {
    throw new Error(`Failed to load person: ${personRes.error.message}`);
  }
  const person = personRes.data;
  if (!person) notFound();

  const heldRoleIds = new Set(
    (personRolesRes.data ?? []).map((pr) => pr.role_id),
  );
  // Active roles are offered; an archived role the person still holds stays
  // visible so unticking it is possible (same informed-choice pattern as
  // archived vocab elsewhere).
  const roleOptions = (rolesRes.data ?? [])
    .filter((r) => r.is_active || heldRoleIds.has(r.id))
    .map((r) => ({
      id: r.id,
      label: localizedName(locale, r.name_en, r.name_da),
    }));

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
            <BreadcrumbPage>{person.full_name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {person.full_name}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {t("personEditSubtitle")}
        </p>
      </div>

      <PersonPasswordCard
        personId={person.id}
        hasPassword={person.password_hash !== null}
        isSystem={person.is_system}
        hasRole={heldRoleIds.size > 0}
      />

      <PersonForm
        mode={{ kind: "edit", id: person.id }}
        initial={{
          full_name: person.full_name,
          email: person.email ?? "",
          phone: person.phone ?? "",
          preferred_language:
            person.preferred_language?.trim() === "en"
              ? "en"
              : person.preferred_language?.trim() === "da"
                ? "da"
                : "",
          engaged_from: person.engaged_from ?? "",
          engaged_until: person.engaged_until ?? "",
          notify_email: person.notify_email,
          notify_sms: person.notify_sms,
          notes: person.notes ?? "",
          is_active: person.is_active,
          role_ids: [...heldRoleIds],
        }}
        roleOptions={roleOptions}
      />
    </div>
  );
}
