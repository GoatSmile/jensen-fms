import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Bike } from "lucide-react";

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
import { EmptyState } from "@/components/empty-state";
import { Panel } from "@/components/ui/panel";
import { createClient } from "@/lib/supabase/server";
import {
  BIKE_STATUS_VARIANT,
  type BikeStatus,
} from "@/lib/bikes/status";

type Props = {
  organizationId: string;
  /** Jensen's 2–4 letter code for this customer — the start of every bike's code. */
  recognitionPrefix: string | null;
};

/** Enough to recognise the fleet at a glance; the rest is one click away. */
const SHOWN = 25;

function formatDateDa(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("da-DK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

/**
 * The customer's bikes, with the RECOGNITION CODE first — it is what the
 * customer reads off the label and says on the phone (BKTM01), so it is how
 * they are found. Newest assignment first, capped at SHOWN with a link to the
 * full list: an imported municipal fleet runs to hundreds of bikes, and this
 * panel used to render every one of them.
 */
export async function AssignedBikesSection({
  organizationId,
  recognitionPrefix,
}: Props) {
  const [t, tBikeStatus] = await Promise.all([
    getTranslations("assignedBikes"),
    getTranslations("bikeStatus"),
  ]);
  const supabase = await createClient();
  const { data, error, count } = await supabase
    .from("bikes")
    .select(
      `
        id, frame_number, status, assigned_at,
        template:bike_templates(id, name_en, family:bike_families(name), frame_size),
        unit:organization_units!owner_unit_id(name),
        identifiers:bike_identifiers(
          identifier_value, is_active, type:bike_identifier_types(slug)
        )
      `,
      { count: "exact" },
    )
    .eq("owner_organization_id", organizationId)
    .is("deleted_at", null)
    .order("assigned_at", { ascending: false, nullsFirst: false })
    .order("frame_number", { ascending: true })
    .limit(SHOWN);

  if (error) {
    return (
      <Panel title={t("title")}>
        <p className="text-destructive text-sm" role="alert">
          {t("loadError", { msg: error.message })}
        </p>
      </Panel>
    );
  }

  const rows = data ?? [];
  const total = count ?? rows.length;
  const codeOf = (b: (typeof rows)[number]) =>
    (b.identifiers ?? []).find((i) => {
      const type = Array.isArray(i.type) ? i.type[0] : i.type;
      return i.is_active && type?.slug === "fleet_number";
    })?.identifier_value ?? null;

  return (
    <Panel
      title={t("title")}
      description={
        recognitionPrefix
          ? t("countWithPrefix", { count: total, prefix: recognitionPrefix })
          : t("count", { count: total })
      }
      action={
        total > 0 ? (
          <Button asChild size="sm" variant="outline">
            <Link href={`/bikes?owner=${organizationId}`}>
              {t("seeAll", { count: total })}
            </Link>
          </Button>
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <EmptyState
          inPanel
          icon={Bike}
          title={t("emptyTitle")}
          description={t("emptyDesc")}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[110px]">{t("thCode")}</TableHead>
              <TableHead className="w-[180px] sm:w-[220px]">
                {t("thFrame")}
              </TableHead>
              <TableHead className="hidden lg:table-cell">{t("thUnit")}</TableHead>
              <TableHead className="hidden md:table-cell">
                {t("thTemplate")}
              </TableHead>
              <TableHead>{t("thStatus")}</TableHead>
              <TableHead className="hidden text-right lg:table-cell">
                {t("thAssigned")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((b) => (
              <TableRow key={b.id} className="hover:bg-muted/50 cursor-pointer">
                <TableCell className="p-0 font-mono text-sm font-medium">
                  <Link href={`/bikes/${b.id}`} className="block px-4 py-2.5">
                    {codeOf(b) ?? <span className="text-muted-foreground">—</span>}
                  </Link>
                </TableCell>
                <TableCell className="p-0 font-mono text-xs">
                  <Link href={`/bikes/${b.id}`} className="block px-4 py-2.5">
                    {b.frame_number}
                  </Link>
                </TableCell>
                <TableCell className="hidden p-0 text-sm lg:table-cell">
                  <Link href={`/bikes/${b.id}`} className="block px-4 py-2.5">
                    {(Array.isArray(b.unit) ? b.unit[0] : b.unit)?.name ?? (
                      <span className="text-muted-foreground">—</span>
                    )}
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
                  <Link href={`/bikes/${b.id}`} className="block px-4 py-2.5">
                    <Badge
                      variant={
                        BIKE_STATUS_VARIANT[b.status as BikeStatus] ?? "outline"
                      }
                    >
                      {tBikeStatus.has(b.status)
                        ? tBikeStatus(b.status)
                        : b.status}
                    </Badge>
                  </Link>
                </TableCell>
                <TableCell className="hidden p-0 text-right text-xs tabular-nums lg:table-cell">
                  <Link href={`/bikes/${b.id}`} className="block px-4 py-2.5">
                    <span className="text-muted-foreground">
                      {formatDateDa(b.assigned_at)}
                    </span>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Panel>
  );
}
