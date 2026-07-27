"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";

import { saveCallerToContact } from "../../_actions/save-caller";

type OrgContact = { id: string; name: string; phone: string | null };

type Props = {
  messageId: string;
  fromIdentity: string;
  orgName: string;
  orgContacts: OrgContact[];
  defaultName: string;
};

/**
 * The learning loop (layer 5): link an unknown caller's number to a contact of
 * the matched org — new or existing — so the next call from it matches
 * automatically. Every review teaches the matcher.
 */
export function SaveCallerAction({
  messageId,
  fromIdentity,
  orgName,
  orgContacts,
  defaultName,
}: Props) {
  const t = useTranslations("inbox");
  const router = useRouter();
  const [choice, setChoice] = useState("new"); // "new" | contactId
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSave() {
    setError(null);
    start(async () => {
      const target =
        choice === "new"
          ? { kind: "new" as const, name }
          : { kind: "existing" as const, contactId: choice };
      const r = await saveCallerToContact(messageId, target);
      if (!r.ok) return setError(r.error);
      router.refresh();
    });
  }

  const disabled = pending || (choice === "new" && !name.trim());

  return (
    <Panel
      title={t("saveCallerTitle")}
      description={t("saveCallerHint", { phone: fromIdentity, org: orgName })}
      contentClassName="flex flex-col gap-2"
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <select
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          className="border-rule bg-ground h-9 rounded-md border px-2 text-sm"
        >
          <option value="new">{t("saveCallerNew")}</option>
          {orgContacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.phone ? ` · ${c.phone}` : ""}
            </option>
          ))}
        </select>
        {choice === "new" ? (
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("saveCallerNamePlaceholder")}
          />
        ) : null}
      </div>
      <div>
        <Button type="button" size="sm" onClick={onSave} disabled={disabled}>
          <UserPlus aria-hidden />
          {pending ? t("saving") : t("saveCallerButton")}
        </Button>
      </div>
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </Panel>
  );
}
