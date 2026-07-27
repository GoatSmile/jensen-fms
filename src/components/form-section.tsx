"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";

import { Panel } from "@/components/ui/panel";

/**
 * A section of a long form: a `Panel` with the eyebrow title, optionally
 * folded away. Replaces the identical `FormSection` helper that had been
 * copy-pasted into the organisation, part, supplier and template forms.
 *
 * **Why fold.** These forms run 14–21 fields and most of them are filled once
 * and never revisited (plan-design-refresh §9). The section header is a
 * table of contents you can act on: the required fields stay visible, the
 * rest is one click away.
 *
 * **`defaultOpen` is the caller's business** — pass "does this section
 * already hold anything". An edit form then shows what is filled while a
 * create form shows only what is required. Deliberately NOT persisted:
 * `CollapsibleSection`'s single detail-page fold is the same every visit, but
 * a form's right answer changes per record, and a remembered "closed" would
 * hide a customer's address the moment you opened a different customer.
 *
 * **`forceOpen`** unfolds a section that turns out to hold a validation
 * error. Closed sections unmount their children (all three forms build their
 * FormData from React state, never the DOM, so nothing is lost) — which means
 * a field error inside a folded section would otherwise be invisible.
 */
export function FormSection({
  title,
  description,
  collapsible = false,
  defaultOpen = true,
  forceOpen = false,
  children,
}: {
  title: string;
  description?: string;
  /** Without this the section is a plain always-open panel. */
  collapsible?: boolean;
  defaultOpen?: boolean;
  /** Flip to true to unfold — e.g. this section owns the field that failed. */
  forceOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  // Derived, not an effect that pushes state: while `forceOpen` holds, the
  // section stays open regardless of the toggle, and it snaps back to the
  // user's own choice the moment the error clears (the forms drop
  // `errorField` as soon as that field is edited).
  const isOpen = open || forceOpen;

  if (!collapsible) {
    return (
      <Panel
        title={title}
        description={description}
        contentClassName="flex flex-col gap-3"
      >
        {children}
      </Panel>
    );
  }

  return (
    <Panel
      title={
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={isOpen}
          className="hover:text-ink -m-1 flex items-center gap-1.5 rounded p-1 text-left transition-colors"
        >
          <ChevronRight
            className={`size-3.5 shrink-0 transition-transform ${
              isOpen ? "rotate-90" : ""
            }`}
            aria-hidden
          />
          {title}
        </button>
      }
      description={description}
      // Closed, the header's own bottom margin is all the padding the panel
      // needs — p-5 under an empty body reads as a lopsided box.
      className={isOpen ? undefined : "pb-2"}
      contentClassName={isOpen ? "flex flex-col gap-3" : undefined}
    >
      {isOpen ? children : null}
    </Panel>
  );
}
