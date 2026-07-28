"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

/**
 * Footer bar for the admin controlled-vocab forms: dirty/saved status on the
 * left, Cancel + submit on the right.
 *
 * Eight byte-identical copies existed — colours, part categories, customer
 * segments, families, HS codes, inventory locations, people, roles. Only the
 * status line, the cancel target and the submit label vary, so those are props.
 *
 * A client component, not a server one: every caller is `"use client"`, and an
 * async server component cannot render inside a client tree.
 *
 * **Why `status` and `submitLabel` are rendered strings rather than a message
 * namespace** (the trick `ArchivePanel` uses): these namespaces have drifted.
 * Six say `savedAt` / `saveChanges`, while `adminColors` and `adminHsCodes` say
 * `savedStatus` / `submitEdit` for the same two things. Passing strings avoids
 * an i18n rename across three locale files for a layout change — but the drift
 * is real, and worth normalising the next time these messages are touched.
 *
 * `bg-surface`, NOT `bg-ground`: this bar sits at page level under the form,
 * where the page background already is `--ground` (CLAUDE.md).
 */
export function FormSaveBar({
  status,
  cancelHref,
  submitLabel,
  pending,
}: {
  /** "Up to date", "Saved at 14:52", "Not saved yet" — the caller's keys. */
  status: React.ReactNode;
  cancelHref: string;
  submitLabel: string;
  pending: boolean;
}) {
  const tCommon = useTranslations("common");

  return (
    <div className="bg-surface flex items-center justify-between gap-2 rounded-lg p-3">
      <span className="text-muted-foreground text-xs">{status}</span>
      <div className="flex gap-2">
        <Button asChild type="button" variant="outline" disabled={pending}>
          <Link href={cancelHref}>{tCommon("cancel")}</Link>
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? tCommon("saving") : submitLabel}
        </Button>
      </div>
    </div>
  );
}
