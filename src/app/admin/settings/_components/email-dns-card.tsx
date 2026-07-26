"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("adminSettings");
  const tCommon = useTranslations("common");
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
      setSuccess(t("saved"));
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="dns-domain">{t("sendingDomainLabel")}</Label>
        <Input
          id="dns-domain"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="jensenproduction.dk"
          className="max-w-[280px] font-mono"
        />
        <p className="text-muted-foreground text-xs">
          {t("sendingDomainHelp")}
        </p>
      </div>

      {records.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed p-3 text-center text-xs">
          {t("dnsEmpty")}
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
                    aria-label={t("recordTypeAria", { n: i + 1 })}
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
                  aria-label={t("recordNameAria", { n: i + 1 })}
                  value={r.name}
                  onChange={(e) => updateRecord(i, { name: e.target.value })}
                  placeholder={t("recordNamePlaceholder")}
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
                    aria-label={t("recordStatusAria", { n: i + 1 })}
                    className="w-[120px] shrink-0"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">
                      <span className="size-1.5 rounded-full bg-money" aria-hidden />
                      {t("statusPending")}
                    </SelectItem>
                    <SelectItem value="verified">
                      <span className="size-1.5 rounded-full bg-good" aria-hidden />
                      {t("statusVerified")}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => removeRecord(i)}
                  aria-label={t("removeRecordAria", { n: i + 1 })}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  aria-label={t("recordValueAria", { n: i + 1 })}
                  value={r.value}
                  onChange={(e) => updateRecord(i, { value: e.target.value })}
                  placeholder={t("recordValuePlaceholder")}
                  className="flex-1 font-mono text-xs"
                />
                <Button
                  type="button"
                  size="icon-sm"
                  variant="outline"
                  onClick={() => void copyValue(i, r.value)}
                  aria-label={t("copyRecordAria", { n: i + 1 })}
                  disabled={r.value.trim() === ""}
                >
                  {copiedIdx === i ? (
                    <Check className="text-good" aria-hidden />
                  ) : (
                    <Copy aria-hidden />
                  )}
                </Button>
              </div>
              <Input
                aria-label={t("recordNoteAria", { n: i + 1 })}
                value={r.note}
                onChange={(e) => updateRecord(i, { note: e.target.value })}
                placeholder={t("recordNotePlaceholder")}
                className="text-xs"
              />
            </div>
          ))}
        </div>
      )}

      <div>
        <Button type="button" size="sm" variant="outline" onClick={addRecord}>
          <Plus aria-hidden /> {t("addRecord")}
        </Button>
      </div>

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="text-sm text-good" role="status">
          {success}
        </p>
      ) : null}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? tCommon("saving") : t("saveDns")}
        </Button>
      </div>
    </form>
  );
}
