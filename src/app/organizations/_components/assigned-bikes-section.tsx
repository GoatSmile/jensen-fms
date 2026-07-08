import Link from "next/link";
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
  bikeStatusLabel,
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
          <h2 className="text-sm font-semibold">Assigned bikes</h2>
        </header>
        <div className="p-4">
          <p className="text-destructive text-sm" role="alert">
            Could not load bikes: {error.message}
          </p>
        </div>
      </section>
    );
  }

  const rows = data ?? [];

  return (
    <section className="rounded-md border">
      <header className="flex items-baseline gap-2 border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Assigned bikes</h2>
        <span className="text-muted-foreground text-xs">
          {rows.length} {rows.length === 1 ? "bike" : "bikes"}
        </span>
      </header>
      {rows.length === 0 ? (
        <div className="p-4">
          <EmptyState
            icon={Bike}
            title="No bikes assigned yet"
            description="Once bikes are assigned to this customer, they appear here."
          />
        </div>
      ) : (
        <div className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px] sm:w-[220px]">
                  Frame number
                </TableHead>
                <TableHead className="hidden md:table-cell">Template</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden text-right lg:table-cell">
                  Assigned
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
                        {bikeStatusLabel(b.status)}
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
