"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { KeyRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";

import { setRolePassword } from "../_actions/manage-roles";

/**
 * Write-only password set/rotate for a role (auth v0.5). Mirrors the
 * env-secret status pattern: the UI only ever shows set / not set — the
 * stored value is a scrypt hash and can't be displayed again.
 */
export function RolePasswordCard({
  roleId,
  hasPassword,
}: {
  roleId: string;
  hasPassword: boolean;
}) {
  const router = useRouter();
  const t = useTranslations("adminPeople");
  const tCommon = useTranslations("common");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set("password", password);
    start(async () => {
      const r = await setRolePassword(roleId, fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setPassword("");
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <KeyRound className="size-3.5" aria-hidden />
          {t("passwordTitle")}
        </span>
      }
      action={
        hasPassword ? (
          <Badge variant="success">{t("passwordSet")}</Badge>
        ) : (
          <Badge variant="outline">{t("passwordNotSet")}</Badge>
        )
      }
      contentClassName="flex flex-col gap-3"
    >
      <p className="text-muted-foreground text-sm">
        {hasPassword ? t("passwordStatusSet") : t("passwordStatusMissing")}
      </p>

      <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t("passwordFieldLabel")}
          autoComplete="new-password"
          className="max-w-xs"
          required
        />
        <Button type="submit" disabled={pending || password.length === 0}>
          {pending
            ? tCommon("saving")
            : hasPassword
              ? t("passwordReplaceButton")
              : t("passwordSetButton")}
        </Button>
        {saved ? (
          <span className="text-muted-foreground text-xs">
            {t("passwordSavedNote")}
          </span>
        ) : null}
      </form>

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <p className="text-muted-foreground text-xs">
        {t("passwordWriteOnlyHint")}
      </p>
    </Panel>
  );
}
