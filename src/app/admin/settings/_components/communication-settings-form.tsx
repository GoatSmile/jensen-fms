"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { appendField } from "@/lib/forms";

import { saveCommunicationSettings } from "../_actions/save-settings";

type Props = {
  initialFromEmail: string;
  initialReplyToEmail: string;
  initialTestMode: boolean;
  initialTestEmail: string;
  initialWorkshopPhone: string;
};

/**
 * Outbound identity for app-generated mail (PO to supplier first; the
 * phone-call → ticket pipeline reads the same settings later) plus the
 * workshop phone. Test mode reroutes every outbound mail to the test
 * inboxes — the go-live step is unticking it, not a deploy.
 */
export function CommunicationSettingsForm({
  initialFromEmail,
  initialReplyToEmail,
  initialTestMode,
  initialTestEmail,
  initialWorkshopPhone,
}: Props) {
  const router = useRouter();
  const [fromEmail, setFromEmail] = useState(initialFromEmail);
  const [replyToEmail, setReplyToEmail] = useState(initialReplyToEmail);
  const [testMode, setTestMode] = useState(initialTestMode);
  const [testEmail, setTestEmail] = useState(initialTestEmail);
  const [workshopPhone, setWorkshopPhone] = useState(initialWorkshopPhone);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const fd = new FormData();
    appendField(fd, "outbound_from_email", fromEmail.trim());
    appendField(fd, "outbound_reply_to_email", replyToEmail.trim());
    if (testMode) fd.set("outbound_test_mode", "on");
    appendField(fd, "outbound_test_email", testEmail.trim());
    appendField(fd, "workshop_phone", workshopPhone.trim());
    start(async () => {
      const r = await saveCommunicationSettings(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSuccess("Saved.");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="comm-from">From address</Label>
          <Input
            id="comm-from"
            type="email"
            value={fromEmail}
            onChange={(e) => setFromEmail(e.target.value)}
            placeholder="orders@jensenproduction.dk"
            className="font-mono"
          />
          <p className="text-muted-foreground text-xs">
            Sender for app-generated email. Must be on the domain the email
            provider has verified.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="comm-reply">Reply-to address</Label>
          <Input
            id="comm-reply"
            type="email"
            value={replyToEmail}
            onChange={(e) => setReplyToEmail(e.target.value)}
            placeholder="deej@jensenproduction.dk"
            className="font-mono"
          />
          <p className="text-muted-foreground text-xs">
            Where supplier replies land — usually the real inbox.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 rounded-md border p-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={testMode}
            onChange={(e) => setTestMode(e.target.checked)}
            className="size-4"
          />
          Test mode — reroute all outbound email
        </label>
        <p className="text-muted-foreground pl-6 text-xs">
          While on, every email the app sends goes to the test recipients
          below instead of the real recipient (the mail says who it was meant
          for). Untick to go live.
        </p>
        <div className="flex flex-col gap-1.5 pl-6 pt-1">
          <Label htmlFor="comm-test">Test recipients</Label>
          <Input
            id="comm-test"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="you@example.com, colleague@example.com"
            className="font-mono"
            disabled={!testMode}
          />
          <p className="text-muted-foreground text-xs">
            One or more emails, comma-separated.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="comm-phone">Workshop phone</Label>
        <Input
          id="comm-phone"
          type="tel"
          value={workshopPhone}
          onChange={(e) => setWorkshopPhone(e.target.value)}
          placeholder="+45 12 34 56 78"
          className="max-w-[240px]"
        />
        <p className="text-muted-foreground text-xs">
          Shown on outbound documents; the phone-call → ticket pipeline will
          use it for call routing and SMS later.
        </p>
      </div>

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-400" role="status">
          {success}
        </p>
      ) : null}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save communication settings"}
        </Button>
      </div>
    </form>
  );
}
