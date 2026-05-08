"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  CircleCheck,
  CirclePause,
  MoreVertical,
  Pencil,
  Plus,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney } from "@/lib/parts/format";

import { toggleVariantActive } from "../_actions/manage-variants";
import { EmptyRow, Section } from "./section";

export type VariantRow = {
  id: string;
  sku: string;
  nameEn: string;
  nameDa: string | null;
  frameSize: string | null;
  colorEn: string | null;
  retailPrice: number | null;
  retailCurrency: string | null;
  isActive: boolean;
};

type Props = {
  modelId: string;
  rows: VariantRow[];
  modelIsRetired: boolean;
};

export function VariantsSection({ modelId, rows, modelIsRetired }: Props) {
  const [error, setError] = useState<string | null>(null);

  return (
    <Section
      title="Variants"
      description="Size and colour combinations that can be ordered against this model."
      action={
        <Button
          size="sm"
          variant="outline"
          asChild
          disabled={modelIsRetired}
          title={
            modelIsRetired
              ? "Restore the model before adding variants."
              : undefined
          }
        >
          <Link href={`/bike-models/${modelId}/variants/new`}>
            <Plus aria-hidden /> Add variant
          </Link>
        </Button>
      }
    >
      {error ? (
        <p className="text-destructive mb-3 text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <EmptyRow>
          No variants yet. Add one to track sizes and colours.
        </EmptyRow>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">SKU</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Color</TableHead>
                <TableHead className="text-right">Retail price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[40px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <VariantTableRow
                  key={row.id}
                  modelId={modelId}
                  row={row}
                  onError={setError}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Section>
  );
}

function VariantTableRow({
  modelId,
  row,
  onError,
}: {
  modelId: string;
  row: VariantRow;
  onError: (msg: string | null) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function runToggle() {
    onError(null);
    start(async () => {
      const r = await toggleVariantActive(modelId, row.id, !row.isActive);
      if (!r.ok) onError(r.error);
      else router.refresh();
    });
  }

  return (
    <TableRow className={row.isActive ? "" : "opacity-60"}>
      <TableCell className="font-mono text-xs">{row.sku}</TableCell>
      <TableCell>
        <div className="font-medium">{row.nameEn}</div>
        {row.nameDa && row.nameDa !== row.nameEn ? (
          <div className="text-muted-foreground text-xs">{row.nameDa}</div>
        ) : null}
      </TableCell>
      <TableCell className="text-muted-foreground text-xs">
        {row.frameSize ?? "—"}
      </TableCell>
      <TableCell className="text-muted-foreground text-xs">
        {row.colorEn ?? "—"}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {formatMoney(row.retailPrice, row.retailCurrency)}
      </TableCell>
      <TableCell>
        {row.isActive ? (
          <Badge variant="success">Active</Badge>
        ) : (
          <Badge variant="outline">Inactive</Badge>
        )}
      </TableCell>
      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Actions for ${row.sku}`}
              disabled={pending}
            >
              <MoreVertical aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link
                href={`/bike-models/${modelId}/variants/${row.id}/edit`}
              >
                <Pencil aria-hidden /> Edit
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={pending}
              onSelect={(e) => {
                e.preventDefault();
                runToggle();
              }}
            >
              {row.isActive ? (
                <>
                  <CirclePause aria-hidden /> Deactivate
                </>
              ) : (
                <>
                  <CircleCheck aria-hidden /> Activate
                </>
              )}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
