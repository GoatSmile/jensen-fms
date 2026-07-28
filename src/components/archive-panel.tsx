"use client";

import { useState, useTransition } from "react";
import { Archive, ArchiveRestore } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";

/**
 * Soft-archive / restore footer for an admin controlled-vocab detail page.
 *
 * Seven copies of this existed — colours, part categories, customer segments,
 * HS codes, kits, inventory locations, suppliers — identical down to the class
 * list. Only three things legitimately vary: the *reason* text, the action
 * itself, and whether the action is blocked. Those are props; the chrome lives
 * here once.
 *
 * **Untinted on purpose, and it is a contrast decision, not taste.** A
 * `hue="money"` wash was tried here (archiving is a caution, and caution is
 * money's ochre) and MEASURED at 4.25:1 for the destructive button's own
 * `alert/10` pill composited over that wash — under the 4.5:1 gate, where
 * plain `bg-surface` gives 4.69:1. This is the cross-hue trap CLAUDE.md names:
 * a hue panel lets any two hues meet, and alert-on-money is one of the pairs
 * that fails. The destructive `Button` already carries the weight of the act,
 * so the surface does not need to shout — and colour stays scarce.
 *
 * **Why `namespace` can be a prop.** All seven callers' namespaces hold the
 * same six keys (`archiveTitle`, `restoreTitle`, `archive`, `archiving`,
 * `restore`, `restoring`) — verified against `messages/en.json`. The
 * entity-specific description keys stay at the call site, where they are
 * declared and where the counts they interpolate live.
 */
export function ArchivePanel({
  namespace,
  isActive,
  description,
  onToggle,
  blocked = false,
  variant = "panel",
}: {
  /** Message namespace holding the six shared archive/restore keys. */
  namespace: string;
  isActive: boolean;
  /** Why archiving is (or is not) safe. The one genuinely per-entity part. */
  description: React.ReactNode;
  /** Flips the flag. Resolve to an error string to show it inline, else null. */
  onToggle: () => Promise<string | null>;
  /** Disables the action. The description must then say why. */
  blocked?: boolean;
  /**
   * `"panel"` is the detail-page footer. `"inline"` drops the `Panel` wrapper for
   * callers that are already inside one — `/admin/lists` expands a row into an
   * editor, and a Panel nested in a table cell inside a Panel is exactly the card
   * soup the panel convention replaced. Added as a variant rather than letting
   * that page hand-roll an eighth copy of this control: the pending/error
   * handling and the six shared message keys stay in one place.
   */
  variant?: "panel" | "inline";
}) {
  const t = useTranslations(namespace);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onClick() {
    setError(null);
    start(async () => {
      setError(await onToggle());
    });
  }

  const button = (
    <Button
      type="button"
      size="sm"
      variant={isActive ? "destructive" : "outline"}
      onClick={onClick}
      disabled={pending || blocked}
    >
      {isActive ? (
        <>
          <Archive className="size-4" aria-hidden />
          {pending ? t("archiving") : t("archive")}
        </>
      ) : (
        <>
          <ArchiveRestore className="size-4" aria-hidden />
          {pending ? t("restoring") : t("restore")}
        </>
      )}
    </Button>
  );

  const errorLine = error ? (
    <p className="text-destructive text-xs" role="alert">
      {error}
    </p>
  ) : null;

  if (variant === "inline") {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <p className="text-ink-2 text-xs">{description}</p>
          <div className="shrink-0">{button}</div>
        </div>
        {errorLine}
      </div>
    );
  }

  return (
    <Panel
      title={isActive ? t("archiveTitle") : t("restoreTitle")}
      description={description}
      // With no error the body is empty, and the header's own bottom margin is
      // then all the padding the panel needs — p-5 under an empty body reads as
      // a lopsided box (same trade as FormSection's folded state).
      className={error ? undefined : "pb-2"}
      action={button}
    >
      {errorLine}
    </Panel>
  );
}
