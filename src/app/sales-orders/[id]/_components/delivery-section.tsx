"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { FileSignature } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Textarea } from "@/components/ui/textarea";

import { saveSODelivery } from "../../_actions/save-delivery";
import { DeliveryCalendar } from "./delivery-calendar";

/**
 * The order's delivery: recipient, phone, address — and, once it is ready or
 * delivered, the delivery note where the recipient signs (/work/deliveries).
 */
export function DeliverySection({
  soId,
  status,
  initial,
  defaultAddress,
  signedBy,
  signedAt,
  calendarEntry,
  requestedDate,
}: {
  soId: string;
  status: string;
  initial: { contactName: string; contactPhone: string; address: string };
  /** The department's or customer's address — used when none is set here. */
  defaultAddress: string | null;
  signedBy: string | null;
  signedAt: string | null;
  /** The delivery's calendar entry, on this order or the offer it came from. */
  calendarEntry: { eventId: string; start: string | null; allDay: boolean } | null;
  requestedDate: string | null;
}) {
  const t = useTranslations("soDelivery");
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const locked = status === "delivered" || status === "cancelled";
  const dirty =
    values.contactName !== initial.contactName ||
    values.contactPhone !== initial.contactPhone ||
    values.address !== initial.address;
  const showNote = status === "ready" || status === "delivered";

  function save() {
    setError(null);
    start(async () => {
      const r = await saveSODelivery(soId, values);
      if (!r.ok) setError(r.error);
      else setSavedAt(new Date().toLocaleTimeString("da-DK"));
    });
  }

  return (
    <Panel
      title={t("title")}
      description={t("description")}
      action={
        showNote ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`/work/deliveries/${soId}`}>
              <FileSignature aria-hidden /> {t("openNote")}
            </Link>
          </Button>
        ) : null
      }
    >
      <div className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span>{t("contactName")}</span>
            <Input
              value={values.contactName}
              onChange={(e) =>
                setValues((v) => ({ ...v, contactName: e.target.value }))
              }
              disabled={locked}
              autoComplete="off"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>{t("contactPhone")}</span>
            <Input
              type="tel"
              value={values.contactPhone}
              onChange={(e) =>
                setValues((v) => ({ ...v, contactPhone: e.target.value }))
              }
              disabled={locked}
              autoComplete="off"
            />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span>{t("address")}</span>
          <Textarea
            rows={2}
            value={values.address}
            onChange={(e) => setValues((v) => ({ ...v, address: e.target.value }))}
            placeholder={
              defaultAddress
                ? t("addressDefault", { address: defaultAddress })
                : undefined
            }
            disabled={locked}
          />
        </label>
        {signedAt ? (
          <p className="text-good text-sm">
            {t("signed", {
              name: signedBy ?? "—",
              time: new Date(signedAt).toLocaleString("da-DK", {
                dateStyle: "medium",
                timeStyle: "short",
              }),
            })}
          </p>
        ) : null}
        <DeliveryCalendar soId={soId} status={status} entry={calendarEntry} defaultDate={requestedDate} />
        {!locked ? (
          <div className="flex items-center justify-end gap-3">
            <span className="text-muted-foreground text-xs">
              {dirty ? t("unsaved") : savedAt ? t("savedAt", { time: savedAt }) : ""}
            </span>
            <Button size="sm" onClick={save} disabled={pending || !dirty}>
              {pending ? t("saving") : t("save")}
            </Button>
          </div>
        ) : null}
        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Panel>
  );
}
