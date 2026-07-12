"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Archive, Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { countryName } from "@/lib/countries";

import { archiveOrganization } from "../_actions/archive-organization";

type Props = {
  organizationId: string;
  legalName: string;
  subtitle: string | null;
  segmentLabel: string | null;
  countryCode: string | null;
  preferredLanguage: string | null;
};

export function OrganizationHeader({
  organizationId,
  legalName,
  subtitle,
  segmentLabel,
  countryCode,
  preferredLanguage,
}: Props) {
  const t = useTranslations("customerDetail");
  const tLang = useTranslations("lang");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function runArchive() {
    setError(null);
    start(async () => {
      const r = await archiveOrganization(
        organizationId,
        reason.trim() === "" ? null : reason,
      );
      if (!r.ok) {
        setError(r.error);
        return;
      }
      // archiveOrganization redirects on success — nothing to do here.
    });
  }

  const metaParts: string[] = [];
  if (segmentLabel) metaParts.push(segmentLabel);
  if (countryCode) metaParts.push(countryName(countryCode));
  if (preferredLanguage)
    metaParts.push(
      tLang.has(preferredLanguage) ? tLang(preferredLanguage) : preferredLanguage,
    );

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            {segmentLabel ? (
              <Badge variant="outline" className="font-normal">
                {segmentLabel}
              </Badge>
            ) : null}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{legalName}</h1>
          {subtitle ? (
            <p className="text-muted-foreground text-sm">{subtitle}</p>
          ) : null}
          {metaParts.length > 0 ? (
            <p className="text-muted-foreground text-xs">
              {metaParts.join(" · ")}
            </p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={`/organizations/${organizationId}/edit`}>
              <Pencil aria-hidden /> {t("edit")}
            </Link>
          </Button>
          <Button
            variant="outline"
            onClick={() => setArchiveOpen(true)}
            disabled={pending}
          >
            <Archive aria-hidden /> {t("archive")}
          </Button>
        </div>
      </div>

      <Dialog
        open={archiveOpen}
        onOpenChange={(open) => {
          if (!open) {
            setArchiveOpen(false);
            setReason("");
            setError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              runArchive();
            }}
            className="flex flex-col gap-4"
          >
            <DialogHeader>
              <DialogTitle>{t("archiveTitle")}</DialogTitle>
              <DialogDescription>{t("archiveDesc")}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="org-archive-reason">
                {t("archiveReasonLabel")}
              </Label>
              <Textarea
                id="org-archive-reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t("archiveReasonPlaceholder")}
              />
              <p className="text-muted-foreground text-xs">
                {t("archiveReasonHint")}
              </p>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setArchiveOpen(false);
                  setReason("");
                  setError(null);
                }}
                disabled={pending}
              >
                {t("keepActive")}
              </Button>
              <Button type="submit" variant="destructive" disabled={pending}>
                {pending ? t("archiving") : t("archiveConfirm")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
