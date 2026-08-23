"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { login, type LoginState } from "./actions";

const INITIAL: LoginState = { error: null };

export type LoginOption = { id: string; full_name: string };

export function LoginForm({
  next,
  options,
  initialPersonId,
}: {
  next: string;
  /** Admin first, then every person who can actually log in. */
  options: LoginOption[];
  /** Last person to log in on this device; falls back to the first option. */
  initialPersonId: string;
}) {
  const t = useTranslations("auth");
  const [state, formAction, pending] = useActionState(login, INITIAL);
  // The id rides in a hidden input rather than on the Select itself —
  // Radix's hidden native select is not a reliable form value here.
  const [personId, setPersonId] = useState(initialPersonId);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="person_id" value={personId} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="person" className="text-sm font-medium">
          {t("whoIsLoggingIn")}
        </Label>
        <Select value={personId} onValueChange={setPersonId}>
          <SelectTrigger id="person" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password" className="text-sm font-medium">
          {t("password")}
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
        />
      </div>
      {state.error ? (
        <p className="text-destructive text-sm" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending || !personId}>
        {pending ? t("checking") : t("logIn")}
      </Button>
    </form>
  );
}
