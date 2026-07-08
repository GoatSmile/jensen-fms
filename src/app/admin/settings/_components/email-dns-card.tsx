"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Plus, Trash2 } from "lucide-react";

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
import { appendField } from "@/lib/forms";

import {
  saveEmailDnsSettings,
  type EmailDnsRecord,
} from "../_actions/save-settings";

type Props = {
  initialDomain: string;
  initialRecords: EmailDnsRecord[];
};

const RECORD_TYPES: EmailDnsRecord["type"][] = ["TXT", "CNAME", "MX"];

/**
 * Reference copy of the email provider's DNS verification records. The
 * authoritative records live at the DNS host (verification happens against
 * the public zone) — this card is the paste-source and status tracker so
 * the values aren't buried in a provider dashboard or an email thread.
 * Once the Resend API key lands, this can fetch records + live status
 * instead of being maintained by hand.
 */
export function EmailDnsCard({ initialDomain, initialRecords }: Props) {
  const router = useRouter();
  const [domain, setDomain] = useState(initialDomain);
  const [records, setRecords] = useState<EmailDnsRecord[]>(initialRecords);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function updateRecord(idx: number, patch: Partial<EmailDnsRecord>) {
    setRecords((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    );
  }

  function addRecord() {
    setRecords((prev) => [
      ...prev,
      { type: "TXT", name: "", value: "", status: "pending", note: "" },
    ]);
  }

  function removeRecord(idx: number) {
    setRecords((prev) => prev.filter((_, i) => i !== idx));
  }

  async function copyValue(idx: number, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx((c) => (c === idx ? null : c)), 1500);
    } catch {
      // Clipboard blocked (permissions/http) — the value is selectable text.
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const fd = new FormData();
    appendField(fd, "email_domain", domain.trim());
    appendField(fd, "records", JSON.stringify(records));
    start(async () => {
      const r = await saveEmailDnsSettings(fd);
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
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="dns-domain">Sending domain</Label>
        <Input
          id="dns-domain"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="jensenproduction.dk"
          className="max-w-[280px] font-mono"
        />
        <p className="text-muted-foreground text-xs">
          The domain outbound email sends from. The records below are what the
          email provider asks you to add at the DNS host — they take effect
          there, not here; this list is the paste-source and status tracker.
        </p>
      </div>

      {records.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed p-3 text-center text-xs">
          No DNS records on file yet. Add the rows from the email
          provider&rsquo;s domain-verification page.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {records.map((r, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-md border p-3">
              <div className="flex items-center gap-2">
                <Select
                  value={r.type}
                  onValueChange={(v) =>
                    updateRecord(i, { type: v as EmailDnsRecord["type"] })
                  }
                >
                  <SelectTrigger
                    aria-label={`Record ${i + 1} type`}
                    className="w-[92px] shrink-0"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RECORD_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  aria-label={`Record ${i + 1} name`}
                  value={r.name}
                  onChange={(e) => updateRecord(i, { name: e.target.value })}
                  placeholder="e.g. resend._domainkey"
                  className="flex-1 font-mono"
                />
                <Select
                  value={r.status}
                  onValueChange={(v) =>
                    updateRecord(i, {
                      status: v as EmailDnsRecord["status"],
                    })
                  }
                >
                  <SelectTrigger
                    aria-label={`Record ${i + 1} status`}
                    className="w-[120px] shrink-0"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">
                      <span className="size-1.5 rounded-full bg-amber-500" aria-hidden />
                      Pending
                    </SelectItem>
                    <SelectItem value="verified">
                      <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
                      Verified
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => removeRecord(i)}
                  aria-label={`Remove record ${i + 1}`}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  aria-label={`Record ${i + 1} value`}
                  value={r.value}
                  onChange={(e) => updateRecord(i, { value: e.target.value })}
                  placeholder="Record value — paste from the provider"
                  className="flex-1 font-mono text-xs"
                />
                <Button
                  type="button"
                  size="icon-sm"
                  variant="outline"
                  onClick={() => void copyValue(i, r.value)}
                  aria-label={`Copy record ${i + 1} value`}
                  disabled={r.value.trim() === ""}
                >
                  {copiedIdx === i ? (
                    <Check className="text-emerald-600" aria-hidden />
                  ) : (
                    <Copy aria-hidden />
                  )}
                </Button>
              </div>
              <Input
                aria-label={`Record ${i + 1} note`}
                value={r.note}
                onChange={(e) => updateRecord(i, { note: e.target.value })}
                placeholder="Note (optional) — e.g. SPF, DKIM, return-path"
                className="text-xs"
              />
            </div>
          ))}
        </div>
      )}

      <div>
        <Button type="button" size="sm" variant="outline" onClick={addRecord}>
          <Plus aria-hidden /> Add record
        </Button>
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
          {pending ? "Saving…" : "Save DNS records"}
        </Button>
      </div>
    </form>
  );
}
