import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ChevronRight, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Panel } from "@/components/ui/panel";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { localizedName } from "@/i18n/vocab";
import { createClient } from "@/lib/supabase/server";

/**
 * People & roles — the workforce model's admin home (P1 of
 * docs/plan-people-roles.md): who works here, which hats they wear, what
 * each hat opens, and the per-role login password (auth v0.5).
 */
export default async function AdminPeoplePage() {
  const supabase = await createClient();
  const [t, tCommon, locale] = await Promise.all([
    getTranslations("adminPeople"),
    getTranslations("common"),
    getLocale(),
  ]);

  const [peopleRes, rolesRes, personRolesRes, capsRes] = await Promise.all([
    supabase
      .from("people")
      .select("id, full_name, engagement, email, phone, is_active")
      .order("is_active", { ascending: false })
      .order("full_name", { ascending: true }),
    supabase
      .from("roles")
      .select(
        "id, key, name_en, name_da, home_path, sort_order, is_active, password_hash",
      )
      .order("is_active", { ascending: false })
      .order("sort_order", { ascending: true }),
    supabase.from("person_roles").select("person_id, role_id"),
    supabase.from("role_capabilities").select("role_id"),
  ]);

  if (peopleRes.error || rolesRes.error) {
    throw new Error(
      `Failed to load people/roles: ${
        peopleRes.error?.message ?? rolesRes.error?.message
      }`,
    );
  }

  const people = peopleRes.data ?? [];
  const roles = rolesRes.data ?? [];
  const personRoles = personRolesRes.data ?? [];
  const roleNameById = new Map(
    roles.map((r) => [r.id, localizedName(locale, r.name_en, r.name_da)]),
  );

  const rolesByPerson = new Map<string, string[]>();
  const membersByRole = new Map<string, number>();
  for (const pr of personRoles) {
    const name = roleNameById.get(pr.role_id);
    if (name) {
      const list = rolesByPerson.get(pr.person_id) ?? [];
      list.push(name);
      rolesByPerson.set(pr.person_id, list);
    }
    membersByRole.set(pr.role_id, (membersByRole.get(pr.role_id) ?? 0) + 1);
  }

  const capsByRole = new Map<string, number>();
  for (const rc of capsRes.data ?? []) {
    capsByRole.set(rc.role_id, (capsByRole.get(rc.role_id) ?? 0) + 1);
  }

  const activePeople = people.filter((p) => p.is_active).length;
  const activeRoles = roles.filter((r) => r.is_active).length;

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
            <BreadcrumbLink asChild>
              <Link href="/admin">{t("crumbAdmin")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("crumb")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t("heading")}</h1>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
      </header>

      <Panel
        title={t("peopleSection")}
        description={t("countSummary", {
          active: activePeople,
          total: people.length,
        })}
        action={
          <Button asChild size="sm" variant="outline">
            <Link href="/admin/people/new">
              <Plus aria-hidden /> {t("newPerson")}
            </Link>
          </Button>
        }
      >
        {people.length === 0 ? (
          <p className="text-muted-foreground text-sm italic">
            {t("emptyPeople")}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colName")}</TableHead>
                <TableHead className="hidden md:table-cell">
                  {t("colEngagement")}
                </TableHead>
                <TableHead className="hidden lg:table-cell">
                  {t("colRoles")}
                </TableHead>
                <TableHead>{t("colStatus")}</TableHead>
                <TableHead className="w-[36px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {people.map((row) => {
                const href = `/admin/people/${row.id}`;
                return (
                  <TableRow
                    key={row.id}
                    className={`hover:bg-muted/50 cursor-pointer ${row.is_active ? "" : "opacity-60"}`}
                  >
                    <TableCell className="p-0 font-medium">
                      <Link href={href} className="block px-4 py-2.5">
                        {row.full_name}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden p-0 md:table-cell">
                      <Link href={href} className="block px-4 py-2.5">
                        {t(`engagement_${row.engagement}`)}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden p-0 lg:table-cell">
                      <Link href={href} className="block px-4 py-2.5">
                        {(rolesByPerson.get(row.id) ?? []).join(" · ") || "—"}
                      </Link>
                    </TableCell>
                    <TableCell className="p-0">
                      <Link href={href} className="block px-4 py-2.5">
                        {row.is_active ? (
                          <Badge variant="success">{t("statusActive")}</Badge>
                        ) : (
                          <Badge variant="outline">
                            {t("statusArchived")}
                          </Badge>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell className="p-0 text-right">
                      <Link
                        href={href}
                        className="text-muted-foreground block px-3 py-2.5"
                        aria-label={t("openAria", { name: row.full_name })}
                      >
                        <ChevronRight className="size-4" aria-hidden />
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Panel
        title={t("rolesSection")}
        description={t("countSummary", {
          active: activeRoles,
          total: roles.length,
        })}
        action={
          <Button asChild size="sm" variant="outline">
            <Link href="/admin/people/roles/new">
              <Plus aria-hidden /> {t("newRole")}
            </Link>
          </Button>
        }
      >
        {roles.length === 0 ? (
          <p className="text-muted-foreground text-sm italic">
            {t("emptyRoles")}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colRole")}</TableHead>
                <TableHead className="hidden md:table-cell">
                  {t("colHome")}
                </TableHead>
                <TableHead className="hidden text-right lg:table-cell">
                  {t("colCapabilities")}
                </TableHead>
                <TableHead className="hidden text-right lg:table-cell">
                  {t("colPeople")}
                </TableHead>
                <TableHead>{t("colPassword")}</TableHead>
                <TableHead>{t("colStatus")}</TableHead>
                <TableHead className="w-[36px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map((row) => {
                const href = `/admin/people/roles/${row.id}`;
                const name = localizedName(locale, row.name_en, row.name_da);
                return (
                  <TableRow
                    key={row.id}
                    className={`hover:bg-muted/50 cursor-pointer ${row.is_active ? "" : "opacity-60"}`}
                  >
                    <TableCell className="p-0 font-medium">
                      <Link href={href} className="block px-4 py-2.5">
                        {name}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden p-0 md:table-cell">
                      <Link
                        href={href}
                        className="block px-4 py-2.5 font-mono text-xs"
                      >
                        {row.home_path}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden p-0 text-right tabular-nums lg:table-cell">
                      <Link href={href} className="block px-4 py-2.5">
                        {capsByRole.get(row.id) ?? 0}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden p-0 text-right tabular-nums lg:table-cell">
                      <Link href={href} className="block px-4 py-2.5">
                        {membersByRole.get(row.id) ?? 0}
                      </Link>
                    </TableCell>
                    <TableCell className="p-0">
                      <Link href={href} className="block px-4 py-2.5">
                        {row.password_hash ? (
                          <Badge variant="success">{t("passwordSet")}</Badge>
                        ) : (
                          <Badge variant="outline">
                            {t("passwordNotSet")}
                          </Badge>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell className="p-0">
                      <Link href={href} className="block px-4 py-2.5">
                        {row.is_active ? (
                          <Badge variant="success">{t("statusActive")}</Badge>
                        ) : (
                          <Badge variant="outline">
                            {t("statusArchived")}
                          </Badge>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell className="p-0 text-right">
                      <Link
                        href={href}
                        className="text-muted-foreground block px-3 py-2.5"
                        aria-label={t("openAria", { name })}
                      >
                        <ChevronRight className="size-4" aria-hidden />
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}
