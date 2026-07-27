import Link from "next/link";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("bikeDetail.parts");
  const active = rows.filter((r) => r.removedAt == null);
  return (
    <Section title={t("title")} description={t("desc")}>
      {rows.length === 0 ? (
        <EmptyRow>{t("empty")}</EmptyRow>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("thPart")}</TableHead>
              <TableHead className="text-right">{t("thQty")}</TableHead>
              <TableHead className="hidden sm:table-cell">
                {t("thInstalled")}
              </TableHead>
              <TableHead className="hidden md:table-cell">
                {t("thNotes")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} className={r.removedAt ? "opacity-60" : ""}>
                <TableCell className="min-w-0 whitespace-normal">
                  <Link
                    href={`/parts/${r.partId}`}
                    className="font-medium break-words hover:underline"
                  >
                    {r.partName}
                  </Link>
                  <div className="text-muted-foreground font-mono text-xs break-all">
                    {r.partSku}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.quantity}
                </TableCell>
                <TableCell className="text-muted-foreground hidden text-xs sm:table-cell">
                  {formatDateTime(r.installedAt)}
                  {r.removedAt ? (
                    <span className="ml-2">
                      {t("removed", { date: formatDateTime(r.removedAt) })}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="text-muted-foreground hidden text-xs md:table-cell">
                  {r.notes ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {rows.length > 0 && active.length !== rows.length ? (
        <p className="text-muted-foreground mt-2 text-xs">
          {t("currentlyInstalled", {
            active: active.length,
            total: rows.length,
          })}
        </p>
      ) : null}
    </Section>
  );
}
