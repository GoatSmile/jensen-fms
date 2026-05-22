import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  MO_STATUS_VARIANT,
  moStatusLabel,
  type MOStatus,
} from "@/lib/mo/status";
import { formatDate } from "@/lib/parts/format";

export type LinkedMORow = {
  id: string;
  mo_number: string;
  status: MOStatus;
  target_quantity: number;
  completed_quantity: number;
  planned_completion_date: string | null;
  templateLabel: string | null;
};

export function LinkedMOsSection({ rows }: { rows: LinkedMORow[] }) {
  return (
    <section className="rounded-md border">
      <header className="flex flex-col gap-0.5 border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Manufacturing orders</h2>
        <p className="text-muted-foreground text-xs">
          MOs spawned from this SO's bike-template lines. Open each to follow
          build progress.
        </p>
      </header>
      {rows.length === 0 ? (
        <p className="text-muted-foreground p-4 text-sm italic">
          No MOs yet — spawn one from a template line above.
        </p>
      ) : (
        <div className="overflow-x-auto md:overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>MO</TableHead>
                <TableHead className="hidden md:table-cell">Template</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Progress</TableHead>
                <TableHead className="hidden text-right lg:table-cell">
                  Planned completion
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((mo) => {
                const pct =
                  mo.target_quantity > 0
                    ? Math.round(
                        (mo.completed_quantity / mo.target_quantity) * 100,
                      )
                    : 0;
                return (
                  <TableRow key={mo.id} className="hover:bg-muted/50">
                    <TableCell className="p-0 font-mono text-xs">
                      <Link
                        href={`/manufacturing-orders/${mo.id}`}
                        className="block px-4 py-2.5 hover:underline"
                      >
                        {mo.mo_number}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden text-sm md:table-cell">
                      {mo.templateLabel ?? (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={MO_STATUS_VARIANT[mo.status] ?? "outline"}
                      >
                        {moStatusLabel(mo.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {mo.completed_quantity}/{mo.target_quantity}{" "}
                      <span className="text-muted-foreground text-[10px]">
                        ({pct}%)
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden text-right text-xs lg:table-cell">
                      {formatDate(mo.planned_completion_date)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
