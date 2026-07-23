"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { claimPerson } from "../_actions/claim-person";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function PersonPicker({
  people,
  currentId,
  next,
}: {
  people: { id: string; full_name: string }[];
  currentId: string | null;
  next: string;
}) {
  const t = useTranslations("whoami");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [pickedId, setPickedId] = useState<string | null>(null);

  function pick(personId: string) {
    setError(null);
    setPickedId(personId);
    const fd = new FormData();
    fd.set("person_id", personId);
    fd.set("next", next);
    start(async () => {
      // Redirects on success; only returns on validation failure.
      const r = await claimPerson(fd);
      if (r && !r.ok) {
        setError(r.error);
        setPickedId(null);
      }
    });
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3">
        {people.map((person) => {
          const isCurrent = person.id === currentId;
          const isPicked = person.id === pickedId;
          return (
            <button
              key={person.id}
              type="button"
              onClick={() => pick(person.id)}
              disabled={pending}
              className={cn(
                "bg-card hover:bg-muted/40 flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors disabled:opacity-60",
                isCurrent && "border-primary",
                isPicked && "opacity-60",
              )}
            >
              <span
                className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-full text-lg font-semibold"
                aria-hidden
              >
                {initials(person.full_name)}
              </span>
              <span className="max-w-full truncate text-sm font-medium">
                {person.full_name}
              </span>
              {isCurrent ? (
                <Badge variant="success">{t("currentBadge")}</Badge>
              ) : null}
            </button>
          );
        })}
      </div>

      {error ? (
        <p className="text-destructive text-center text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <Link
        href={next}
        className="text-muted-foreground hover:text-foreground text-center text-sm underline underline-offset-4"
      >
        {t("continueWithout")}
      </Link>
    </div>
  );
}
