import Link from "next/link";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/parts/format";

import { EmptyRow, Section } from "./section";

export type InstalledPartRow = {
  id: string;
  partId: string;
  partSku: string;
  partName: string;
  quantity: number;
  installedAt: string;
  removedAt: string | null;
  notes: string | null;
};

export function PartsInstalledSection({ rows }: { rows: InstalledPartRow[] }) {
  const active = rows.filter((r) => r.removedAt == null);
  return (
    <Section
      title="Parts installed"
      description="Parts consumed when this bike was built. The build flow (Phase 2C) populates this; manually-created bikes start empty."
    >
      {rows.length === 0 ? (
        <EmptyRow>No parts on file. The build flow populates this.</EmptyRow>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Part</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Installed</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} className={r.removedAt ? "opacity-60" : ""}>
                  <TableCell>
                    <Link
                      href={`/parts/${r.partId}`}
                      className="font-medium hover:underline"
                    >
                      {r.partName}
                    </Link>
                    <div className="text-muted-foreground font-mono text-xs">
                      {r.partSku}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.quantity}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {formatDateTime(r.installedAt)}
                    {r.removedAt ? (
                      <span className="ml-2">
                        (removed {formatDateTime(r.removedAt)})
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {r.notes ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {rows.length > 0 && active.length !== rows.length ? (
        <p className="text-muted-foreground mt-2 text-xs">
          {active.length} of {rows.length} parts currently installed.
        </p>
      ) : null}
    </Section>
  );
}
