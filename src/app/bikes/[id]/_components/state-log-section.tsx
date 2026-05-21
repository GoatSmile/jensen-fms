import { ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/parts/format";
import {
  BIKE_STATUS_VARIANT,
  bikeStatusLabel,
  type BikeStatus,
} from "@/lib/bikes/status";

import { EmptyRow, Section } from "./section";

export type StateLogRow = {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  occurredAt: string;
  reason: string | null;
};

export function StateLogSection({ rows }: { rows: StateLogRow[] }) {
  return (
    <Section
      title="State log"
      description="Every lifecycle change with timestamp and reason. Append-only audit trail."
    >
      {rows.length === 0 ? (
        <EmptyRow>No state changes recorded yet.</EmptyRow>
      ) : (
        <div className="overflow-x-auto rounded-md border md:overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px] sm:w-[180px]">When</TableHead>
                <TableHead>Transition</TableHead>
                <TableHead className="hidden sm:table-cell">Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-muted-foreground text-xs">
                    {formatDateTime(row.occurredAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {row.fromStatus ? (
                        <Badge
                          variant={
                            BIKE_STATUS_VARIANT[row.fromStatus as BikeStatus] ??
                            "outline"
                          }
                        >
                          {bikeStatusLabel(row.fromStatus)}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          (created)
                        </span>
                      )}
                      <ArrowRight aria-hidden className="size-3" />
                      <Badge
                        variant={
                          BIKE_STATUS_VARIANT[row.toStatus as BikeStatus] ??
                          "outline"
                        }
                      >
                        {bikeStatusLabel(row.toStatus)}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden max-w-[320px] truncate text-xs sm:table-cell">
                    {row.reason ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Section>
  );
}
