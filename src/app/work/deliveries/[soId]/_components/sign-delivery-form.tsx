"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Eraser } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import {
  SignaturePad,
  type SignaturePadHandle,
} from "@/components/signature-pad";

import { signDelivery } from "../../_actions/sign-delivery";

/**
 * The recipient's name and finger signature. The labels on the paper side come
 * in the ORDER's language (the customer reads them); the buttons follow the
 * viewer's. Signing delivers the order — there is no separate "delivered".
 */
export function SignDeliveryForm({
  soId,
  labels,
  defaultSigner,
}: {
  soId: string;
  labels: { signHere: string; signerName: string };
  defaultSigner: string;
}) {
  const t = useTranslations("deliveries");
  const pad = useRef<SignaturePadHandle>(null);
  const [name, setName] = useState(defaultSigner);
  const [hasInk, setHasInk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setError(null);
    const png = pad.current?.toDataUrl();
    if (!png) {
      setError(t("signFirst"));
      return;
    }
    start(async () => {
      const r = await signDelivery(soId, { signerName: name, signaturePng: png });
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <Panel contentClassName="flex flex-col gap-3">
      <h2 className="text-ink-2 text-xs font-bold tracking-[0.075em] uppercase">
        {labels.signHere}
      </h2>
      <label className="flex flex-col gap-1 text-sm">
        <span>{labels.signerName}</span>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
          className="h-11 text-base"
        />
      </label>
      <SignaturePad ref={pad} onChange={setHasInk} label={labels.signHere} />
      <div className="flex flex-wrap justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => pad.current?.clear()}
          disabled={pending || !hasInk}
        >
          <Eraser className="size-4" aria-hidden /> {t("clearSignature")}
        </Button>
        <Button
          type="button"
          size="lg"
          onClick={submit}
          disabled={pending || !hasInk || !name.trim()}
          className="bg-good text-on-good hover:bg-good h-12 font-semibold"
        >
          <CheckCircle2 className="size-5" aria-hidden />
          {pending ? t("signing") : t("signAndDeliver")}
        </Button>
      </div>
      {error ? (
        <p className="text-alert text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </Panel>
  );
}
