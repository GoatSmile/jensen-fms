"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  ArchiveRestore,
  ArchiveX,
  MoreHorizontal,
  Pencil,
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
  restoreBikeModel,
  retireBikeModel,
} from "../_actions/retire-bike-model";

type Props = {
  modelId: string;
  nameEn: string;
  nameDa: string | null;
  bikeTypeName: string | null;
  manufacturer: string | null;
  modelYear: number | null;
  isDeleted: boolean;
};

export function BikeModelHeader({
  modelId,
  nameEn,
  nameDa,
  bikeTypeName,
  manufacturer,
  modelYear,
  isDeleted,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmRetire, setConfirmRetire] = useState(false);

  function runRetire() {
    setActionError(null);
    startTransition(async () => {
      const r = await retireBikeModel(modelId);
      if (!r.ok) {
        setActionError(r.error);
        setConfirmRetire(false);
      } else {
        router.refresh();
      }
    });
  }

  function runRestore() {
    setActionError(null);
    startTransition(async () => {
      const r = await restoreBikeModel(modelId);
      if (!r.ok) setActionError(r.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {isDeleted ? (
        <div className="bg-destructive/10 text-destructive rounded-md border border-destructive/30 px-3 py-2 text-sm">
          This model is retired. New variants and templates are blocked while
          retired.
        </div>
      ) : null}
      {actionError ? (
        <p className="text-destructive text-sm" role="alert">
          {actionError}
        </p>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            {bikeTypeName ? (
              <Badge variant="outline" className="font-normal">
                {bikeTypeName}
              </Badge>
            ) : null}
            {manufacturer ? (
              <span className="text-muted-foreground text-xs">
                {manufacturer}
                {modelYear ? ` · ${modelYear}` : ""}
              </span>
            ) : modelYear ? (
              <span className="text-muted-foreground text-xs">
                {modelYear}
              </span>
            ) : null}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{nameEn}</h1>
          {nameDa && nameDa !== nameEn ? (
            <p className="text-muted-foreground text-sm">{nameDa}</p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild disabled={isPending}>
            <Link href={`/bike-models/${modelId}/edit`}>
              <Pencil aria-hidden /> Edit
            </Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label="More model actions"
                disabled={isPending}
              >
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isDeleted ? (
                <DropdownMenuItem
                  disabled={isPending}
                  onSelect={(e) => {
                    e.preventDefault();
                    runRestore();
                  }}
                >
                  <ArchiveRestore aria-hidden /> Restore model
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  variant="destructive"
                  disabled={isPending}
                  onSelect={(e) => {
                    e.preventDefault();
                    if (confirmRetire) runRetire();
                    else setConfirmRetire(true);
                  }}
                >
                  <ArchiveX aria-hidden />{" "}
                  {confirmRetire ? "Click again to confirm" : "Retire model"}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
