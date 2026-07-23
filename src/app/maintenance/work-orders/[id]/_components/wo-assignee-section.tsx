"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CircleUser } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { setWorkOrderAssignee } from "../_actions/set-assignee";
import { Section } from "./section";

// Radix Select can't hold an empty string — sentinel for "unassigned".
const UNASSIGNED = "__unassigned__";

export function WOAssigneeSection({
  woId,
  options,
  currentId,
  myPersonId,
  readOnly,
}: {
  woId: string;
  options: { id: string; label: string }[];
  currentId: string | null;
  /** The session person (tap-your-name) — enables "Assign to me". */
  myPersonId: string | null;
  readOnly: boolean;
}) {
  const router = useRouter();
  const t = useTranslations("workOrders");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  function save(personId: string | null) {
    setError(null);
    setSaved(false);
    const fd = new FormData();
    if (personId) fd.set("person_id", personId);
    start(async () => {
      const r = await setWorkOrderAssignee(woId, fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <Section title={t("assigneeTitle")}>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={currentId ?? UNASSIGNED}
            onValueChange={(v) => save(v === UNASSIGNED ? null : v)}
            disabled={readOnly || pending}
          >
            <SelectTrigger className="w-full sm:max-w-[240px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNASSIGNED}>{t("unassigned")}</SelectItem>
              {options.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!readOnly && myPersonId && currentId !== myPersonId ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => save(myPersonId)}
            >
              <CircleUser aria-hidden /> {t("assignToMe")}
            </Button>
          ) : null}
          {saved ? (
            <span className="text-muted-foreground text-xs">
              {t("assigneeSavedNote")}
            </span>
          ) : null}
        </div>
        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Section>
  );
}
