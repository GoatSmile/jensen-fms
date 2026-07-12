import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Bike } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { createClient } from "@/lib/supabase/server";
import {
  BIKE_STATUS_VARIANT,
  type BikeStatus,
} from "@/lib/bikes/status";

type Props = {
  organizationId: string;
};

function formatDateDa(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("da-DK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

/**
 * Server-rendered list of bikes assigned to this organization. Phase 3A
 * scope is read-only; Phase 3C will layer on aggregate stats and richer
 * filters. Sorted by `assigned_at desc` so newest assignments lead.
 */
export async function AssignedBikesSection({ organizationId }: Props) {
  const [t, tBikeStatus] = await Promise.all([
    getTranslations("assignedBikes"),
    getTranslations("bikeStatus"),
  ]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bikes")
    .select(
      `
        id, frame_number, status, assigned_at,
        template:bike_templates(id, name_en, family:bike_families(name), frame_size)
      `,
    )
    .eq("owner_organization_id", organizationId)
    .is("deleted_at", null)
    .order("assigned_at", { ascending: false, nullsFirst: false });

  if (error) {
    return (
      <section className="rounded-md border">
        <header className="flex items-baseline gap-2 border-b px-4 py-3">
          <h2 className="text-sm font-semibold">{t("title")}</h2>
        </header>
        <div className="p-4">
          <p className="text-destructive text-sm" role="alert">
            {t("loadError", { msg: error.message })}
          </p>
        </div>
      </section>
    );
  }

  const rows = data ?? [];

  return (
    <section className="rounded-md border">
      <header className="flex items-baseline gap-2 border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{t("title")}</h2>
        <span className="text-muted-foreground text-xs">
          {t("count", { count: rows.length })}
        </span>
      </header>
      {rows.length === 0 ? (
        <div className="p-4">
          <EmptyState
            icon={Bike}
            title={t("emptyTitle")}
            description={t("emptyDesc")}
          />
        </div>
      ) : (
        <div className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px] sm:w-[220px]">
                  {t("thFrame")}
                </TableHead>
                <TableHead className="hidden md:table-cell">{t("thTemplate")}</TableHead>
                <TableHead>{t("thStatus")}</TableHead>
                <TableHead className="hidden text-right lg:table-cell">
                  {t("thAssigned")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((b) => (
                <TableRow
                  key={b.id}
                  className="hover:bg-muted/50 cursor-pointer"
                >
                  <TableCell className="p-0 font-mono text-xs">
                    <Link
                      href={`/bikes/${b.id}`}
                      className="block px-4 py-2.5"
                    >
                      {b.frame_number}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden p-0 md:table-cell">
                    <Link
                      href={`/bikes/${b.id}`}
                      className="block px-4 py-2.5 text-sm"
                    >
                      {b.template ? (
                        <span>
                          {[
                            b.template.family?.name,
                            b.template.frame_size,
                            b.template.name_en,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell className="p-0">
                    <Link
                      href={`/bikes/${b.id}`}
                      className="block px-4 py-2.5"
                    >
                      <Badge
                        variant={
                          BIKE_STATUS_VARIANT[b.status as BikeStatus] ??
                          "outline"
                        }
                      >
                        {tBikeStatus.has(b.status)
                          ? tBikeStatus(b.status)
                          : b.status}
                      </Badge>
                    </Link>
                  </TableCell>
                  <TableCell className="hidden p-0 text-right text-xs tabular-nums lg:table-cell">
                    <Link
                      href={`/bikes/${b.id}`}
                      className="block px-4 py-2.5"
                    >
                      <span className="text-muted-foreground">
                        {formatDateDa(b.assigned_at)}
                      </span>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
