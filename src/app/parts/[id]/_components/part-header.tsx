"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  ArchiveRestore,
  ArchiveX,
  ImageIcon,
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

import { restorePart, retirePart } from "../_actions/retire-part";
import {
  AdjustStockDialog,
  type CurrencyOption,
  type LocationOption,
} from "./adjust-stock-dialog";

type Props = {
  partId: string;
  internalSku: string;
  nameEn: string;
  nameDa: string | null;
  categoryName: string | null;
  isDeleted: boolean;
  locations: LocationOption[];
  /** Hide the adjust dialog's location picker (single-location shops). */
  hideLocations?: boolean;
  /** Location the adjust dialog targets while the picker is hidden. */
  primaryLocationId?: string | null;
  /** Public URL of the hero photo, or null when the part has no photos. */
  heroUrl: string | null;
  /** Currencies for the adjust dialog's foreign-cost picker. */
  currencies?: CurrencyOption[];
};

/**
 * Title block + primary actions. Renders a 16×16 hero thumbnail at the
 * start; Edit jumps to /parts/[id]/edit; Adjust opens the stock dialog;
 * the kebab hosts retire/restore.
 *
 * "use client" because retire/restore go through useTransition + router.refresh.
 * The thumbnail and link rendering would happily be server-side, but the
 * boundary cost of splitting them out for that small win isn't worth it.
 */
export function PartHeader({
  partId,
  internalSku,
  nameEn,
  nameDa,
  categoryName,
  isDeleted,
  locations,
  hideLocations = false,
  primaryLocationId = null,
  heroUrl,
  currencies = [],
}: Props) {
  const t = useTranslations("partDetail");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmRetire, setConfirmRetire] = useState(false);

  function runRetire() {
    setActionError(null);
    startTransition(async () => {
      const r = await retirePart(partId);
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
      const r = await restorePart(partId);
      if (!r.ok) setActionError(r.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {isDeleted ? (
        <div className="bg-destructive/10 text-destructive rounded-md border border-destructive/30 px-3 py-2 text-sm">
          {t("retiredBanner")}
        </div>
      ) : null}
      {actionError ? (
        <p className="text-destructive text-sm" role="alert">
          {actionError}
        </p>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <HeroThumb heroUrl={heroUrl} />
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground font-mono text-xs">
                {internalSku}
              </span>
              {categoryName ? (
                <Badge variant="outline" className="font-normal">
                  {categoryName}
                </Badge>
              ) : null}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">{nameEn}</h1>
            {nameDa && nameDa !== nameEn ? (
              <p className="text-muted-foreground text-sm">{nameDa}</p>
            ) : null}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild disabled={isPending}>
            <Link href={`/parts/${partId}/edit`}>
              <Pencil aria-hidden /> {t("edit")}
            </Link>
          </Button>
          {isDeleted ? null : (
            <AdjustStockDialog
              partId={partId}
              partName={nameEn}
              locations={locations}
              defaultLocationId={primaryLocationId ?? undefined}
              hideLocation={hideLocations}
              currencies={currencies}
            />
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label={t("moreActionsAria")}
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
                  <ArchiveRestore aria-hidden /> {t("restorePart")}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  variant="destructive"
                  disabled={isPending}
                  onSelect={(e) => {
                    e.preventDefault();
                    if (confirmRetire) {
                      runRetire();
                    } else {
                      setConfirmRetire(true);
                    }
                  }}
                >
                  <ArchiveX aria-hidden />{" "}
                  {confirmRetire ? tCommon("confirmRepeat") : t("retirePart")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

function HeroThumb({ heroUrl }: { heroUrl: string | null }) {
  const t = useTranslations("partDetail");
  if (!heroUrl) {
    return (
      <div className="bg-muted flex size-16 shrink-0 items-center justify-center rounded-md border border-dashed">
        <ImageIcon
          aria-label={t("noPhotoAria")}
          className="text-muted-foreground size-5"
        />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- See photo-thumb.tsx
    <img
      src={heroUrl}
      alt=""
      className="size-16 shrink-0 rounded-md border object-cover"
    />
  );
}
