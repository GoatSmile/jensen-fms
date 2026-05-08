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
import { formatDate } from "@/lib/parts/format";

export type VersionRow = {
  id: string;
  version: number;
  isCurrent: boolean;
  createdAt: string;
  partCount: number;
};

type Props = {
  rows: VersionRow[];
  thisTemplateId: string;
};

export function VersionHistorySection({ rows, thisTemplateId }: Props) {
  if (rows.length <= 1) return null;
  return (
    <section className="rounded-md border">
      <header className="flex flex-col gap-0.5 border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Version history</h2>
        <p className="text-muted-foreground text-xs">
          Past versions stay queryable so old Manufacturing Orders keep their
          original recipe.
        </p>
      </header>
      <div className="p-4">
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px] text-right">Version</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Parts</TableHead>
                <TableHead>State</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const isThis = row.id === thisTemplateId;
                return (
                  <TableRow
                    key={row.id}
                    className={isThis ? "bg-muted/40" : ""}
                  >
                    <TableCell className="text-right tabular-nums">
                      <Link
                        href={`/bike-templates/${row.id}`}
                        className="font-medium hover:underline"
                      >
                        v{row.version}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {formatDate(row.createdAt)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.partCount}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {row.isCurrent ? (
                          <Badge variant="success">current</Badge>
                        ) : (
                          <Badge variant="outline">past</Badge>
                        )}
                        {isThis ? (
                          <span className="text-muted-foreground text-xs">
                            you are here
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </section>
  );
}
