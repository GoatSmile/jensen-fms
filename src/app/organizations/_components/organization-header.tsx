"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
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

import { archiveOrganization } from "../_actions/archive-organization";

type Props = {
  organizationId: string;
  legalName: string;
  subtitle: string | null;
  segmentLabel: string | null;
  countryCode: string | null;
  preferredLanguage: string | null;
};

const LANGUAGE_LABEL: Record<string, string> = {
  da: "Dansk",
  en: "English",
};

export function OrganizationHeader({
  organizationId,
  legalName,
  subtitle,
  segmentLabel,
  countryCode,
  preferredLanguage,
}: Props) {
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
  if (countryCode) metaParts.push(countryCode);
  if (preferredLanguage)
    metaParts.push(LANGUAGE_LABEL[preferredLanguage] ?? preferredLanguage);

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
              <Pencil aria-hidden /> Edit
            </Link>
          </Button>
          <Button
            variant="outline"
            onClick={() => setArchiveOpen(true)}
            disabled={pending}
          >
            <Archive aria-hidden /> Archive
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
              <DialogTitle>Archive customer?</DialogTitle>
              <DialogDescription>
                The customer will be hidden from the list. Any bikes still
                pointed at this customer keep that link so historical
                assignments remain visible.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="org-archive-reason">Reason (optional)</Label>
              <Textarea
                id="org-archive-reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Contract ended; bikes returned."
              />
              <p className="text-muted-foreground text-xs">
                If given, this is appended to the customer notes for the audit
                trail.
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
                Keep active
              </Button>
              <Button type="submit" variant="destructive" disabled={pending}>
                {pending ? "Archiving…" : "Archive customer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
