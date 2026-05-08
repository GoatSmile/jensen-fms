import Link from "next/link";
import { Plus } from "lucide-react";

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

import { EmptyRow, Section } from "./section";

export type TemplateSummary = {
  id: string;
  name_en: string;
  variant_name: string | null;
  version: number;
  is_current: boolean;
  part_count: number;
};

type Props = {
  modelId: string;
  rows: TemplateSummary[];
  modelIsRetired: boolean;
};

export function TemplatesSection({ modelId, rows, modelIsRetired }: Props) {
  return (
    <Section
      title="Templates"
      description="Saved parts recipes for building this model. Past versions stay queryable; the workbench builds against the current version."
      action={
        <Button
          size="sm"
          variant="outline"
          asChild
          disabled={modelIsRetired}
          title={
            modelIsRetired
              ? "Restore the model before adding templates."
              : undefined
          }
        >
          <Link href={`/bike-templates/new?model=${modelId}`}>
            <Plus aria-hidden /> Add template
          </Link>
        </Button>
      }
    >
      {rows.length === 0 ? (
        <EmptyRow>No templates yet.</EmptyRow>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Variant</TableHead>
                <TableHead className="text-right">Version</TableHead>
                <TableHead className="text-right">Parts</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} className="hover:bg-muted/50">
                  <TableCell className="p-0">
                    <Link
                      href={`/bike-templates/${row.id}`}
                      className="block px-4 py-2.5 font-medium"
                    >
                      {row.name_en}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground p-0 text-xs">
                    <Link
                      href={`/bike-templates/${row.id}`}
                      className="block px-4 py-2.5"
                    >
                      {row.variant_name ?? "Any"}
                    </Link>
                  </TableCell>
                  <TableCell className="p-0 text-right tabular-nums">
                    <Link
                      href={`/bike-templates/${row.id}`}
                      className="block px-4 py-2.5"
                    >
                      v{row.version}
                      {row.is_current ? (
                        <Badge variant="success" className="ml-2">
                          current
                        </Badge>
                      ) : null}
                    </Link>
                  </TableCell>
                  <TableCell className="p-0 text-right tabular-nums">
                    <Link
                      href={`/bike-templates/${row.id}`}
                      className="block px-4 py-2.5"
                    >
                      {row.part_count}
                    </Link>
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
