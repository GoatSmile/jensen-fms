import Link from "next/link";
import { Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Panel } from "@/components/ui/panel";
import { createClient } from "@/lib/supabase/server";
import { kitCode, stickerColor } from "@/lib/kits/colors";

export const dynamic = "force-dynamic";

export default async function KitsPage() {
  const supabase = await createClient();
  const [t, tCommon] = await Promise.all([
    getTranslations("adminKits"),
    getTranslations("common"),
  ]);

  const [kitsRes, membershipsRes] = await Promise.all([
    supabase
      .from("kits")
      .select("id, sticker_color, kit_number, description, is_active")
      .order("is_active", { ascending: false })
      .order("sticker_color", { ascending: true })
      .order("kit_number", { ascending: true, nullsFirst: true }),
    supabase.from("part_kits").select("kit_id"),
  ]);

  const partCount = new Map<string, number>();
  for (const m of membershipsRes.data ?? []) {
    partCount.set(m.kit_id, (partCount.get(m.kit_id) ?? 0) + 1);
  }

  const rows = kitsRes.data ?? [];

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
            <BreadcrumbPage>{t("crumbKits")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
        </header>
        <Button asChild>
          <Link href="/admin/kits/new">
            <Plus aria-hidden /> {t("newKit")}
          </Link>
        </Button>
      </div>

      {rows.length === 0 ? (
        <Panel contentClassName="text-ink-3 bg-ground flex h-32 items-center justify-center rounded-lg text-sm">
          {t("empty")}
        </Panel>
      ) : (
        <Panel>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colKit")}</TableHead>
                <TableHead className="hidden sm:table-cell">
                  {t("colDescription")}
                </TableHead>
                <TableHead className="text-right">{t("colParts")}</TableHead>
                <TableHead className="w-[100px]">{t("colStatus")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((k) => {
                const colour = stickerColor(k.sticker_color);
                return (
                  <TableRow key={k.id} className="hover:bg-muted/50">
                    <TableCell className="p-0">
                      <Link
                        href={`/admin/kits/${k.id}`}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium hover:underline"
                      >
                        <span
                          aria-hidden
                          className="inline-block size-3.5 rounded-full border border-black/10"
                          style={{ backgroundColor: colour.hex }}
                        />
                        {kitCode(k.sticker_color, k.kit_number)}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden p-0 text-sm sm:table-cell">
                      <Link
                        href={`/admin/kits/${k.id}`}
                        className="block px-4 py-2.5"
                      >
                        {k.description ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell className="p-0 text-right text-sm tabular-nums">
                      <Link
                        href={`/admin/kits/${k.id}`}
                        className="block px-4 py-2.5"
                      >
                        {partCount.get(k.id) ?? 0}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant={k.is_active ? "success" : "secondary"}>
                        {k.is_active ? t("active") : t("archived")}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Panel>
      )}
    </div>
  );
}
