"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, MoreVertical, PowerOff } from "lucide-react";

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
import { formatDateTime } from "@/lib/parts/format";

import { deactivateBikeIdentifier } from "../_actions/manage-identifiers";
import {
  IdentifierDialog,
  type IdentifierTypeOption,
} from "./identifier-dialog";
import { Section } from "./section";

export type IdentifierRow = {
  id: string;
  typeId: string;
  typeName: string;
  isRequired: boolean;
  value: string;
  isActive: boolean;
  createdAt: string;
  deactivatedAt: string | null;
};

type Props = {
  bikeId: string;
  rows: IdentifierRow[];
  identifierTypes: IdentifierTypeOption[];
  /** Total required identifiers for this bike type. */
  requiredCount: number;
  /** Required identifiers that have an active row. */
  requiredRegisteredCount: number;
};

export function IdentifiersSection({
  bikeId,
  rows,
  identifierTypes,
  requiredCount,
  requiredRegisteredCount,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const completionLabel =
    requiredCount > 0
      ? `${requiredRegisteredCount} of ${requiredCount} required registered`
      : null;

  return (
    <Section
      title="Identifiers"
      description={
        completionLabel
          ? `${completionLabel}. Add or replace identifiers as they come in.`
          : "Add identifiers as they come in."
      }
      action={
        <IdentifierDialog
          bikeId={bikeId}
          identifierTypes={identifierTypes}
        />
      }
    >
      {error ? (
        <p className="text-destructive mb-3 text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <div className="text-muted-foreground flex h-20 items-center justify-center rounded-md border border-dashed text-sm">
          No identifiers registered yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Registered</TableHead>
                <TableHead className="w-[40px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <IdentifierTableRow
                  key={row.id}
                  bikeId={bikeId}
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

function IdentifierTableRow({
  bikeId,
  row,
  onError,
}: {
  bikeId: string;
  row: IdentifierRow;
  onError: (msg: string | null) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  function runDeactivate() {
    onError(null);
    start(async () => {
      const r = await deactivateBikeIdentifier(bikeId, row.id);
      if (!r.ok) {
        onError(r.error);
        setConfirmDeactivate(false);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <TableRow className={row.isActive ? "" : "opacity-60"}>
      <TableCell>
        {row.typeName}
        {row.isRequired ? (
          <span className="text-muted-foreground ml-1.5 text-xs">required</span>
        ) : null}
      </TableCell>
      <TableCell className="font-mono text-xs">{row.value}</TableCell>
      <TableCell>
        {row.isActive ? (
          <Badge variant="success">Active</Badge>
        ) : (
          <Badge variant="outline">Replaced</Badge>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground text-xs">
        {formatDateTime(row.createdAt)}
        {!row.isActive && row.deactivatedAt ? (
          <span className="ml-2">
            (deactivated {formatDateTime(row.deactivatedAt)})
          </span>
        ) : null}
      </TableCell>
      <TableCell className="text-right">
        {row.isActive ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Actions for ${row.typeName} ${row.value}`}
                disabled={pending}
              >
                <MoreVertical aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                variant="destructive"
                disabled={pending}
                onSelect={(e) => {
                  e.preventDefault();
                  if (confirmDeactivate) runDeactivate();
                  else setConfirmDeactivate(true);
                }}
              >
                {confirmDeactivate ? (
                  <>
                    <CircleCheck aria-hidden /> Click again to confirm
                  </>
                ) : (
                  <>
                    <PowerOff aria-hidden /> Deactivate
                  </>
                )}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </TableCell>
    </TableRow>
  );
}
