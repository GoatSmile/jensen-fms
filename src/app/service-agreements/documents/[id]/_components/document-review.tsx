"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertTriangle, Loader2, RefreshCw, Trash2 } from "lucide-react";

import { Field } from "@/components/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FrameMatch } from "@/lib/service-agreements/documents/match";
import {
  CONTRACT_TYPES,
  contractTypeOf,
  yearlyPriceOf,
  type AgreementReading,
} from "@/lib/service-agreements/documents/reading";

import { confirmAgreementDocument } from "../../../_actions/confirm-document";
import { deleteAgreementDocument } from "../../../_actions/documents";

type AgreementOption = {
  id: string;
  name: string;
  status: string;
  unitId: string | null;
  unitName: string | null;
  contractType: string | null;
};

type Props = {
  documentId: string;
  organizationId: string;
  organizationName: string;
  status: "read" | "failed";
  readError: string | null;
  readAt: string | null;
  reading: AgreementReading;
  matches: FrameMatch[];
  agreements: AgreementOption[];
  units: { id: string; name: string }[];
  presetAgreementId: string | null;
};

const NEW = "__new__";
const NONE = "__none__";

type Row = { bikeId: string | null; include: boolean };

function norm(s: string) {
  return s.toLocaleLowerCase("da-DK").replace(/\s+/g, " ").trim();
}

/**
 * The confirm step (migration 110). Every value starts as what the paper said
 * and is Dennis's to change; the frame list starts ticked only where the code
 * found an exact match on THIS customer that no other agreement holds. A bike
 * on another agreement, another customer's bike, and a near-miss suggestion
 * all start unticked — including one is a decision, not a default.
 */
export function DocumentReview(props: Props) {
  const t = useTranslations("agreementDocs");
  const router = useRouter();
  const { reading, matches, agreements, units } = props;
  const today = new Date().toISOString().slice(0, 10);

  // Which agreement: the one the upload came from, else the one whose
  // department the paper names, else the only active one, else a new one.
  const initialTarget = useMemo(() => {
    if (props.presetAgreementId) return props.presetAgreementId;
    const dept = reading.department ? norm(reading.department) : null;
    if (dept) {
      const byUnit = agreements.find(
        (a) => a.status === "active" && a.unitName && (norm(a.unitName).includes(dept) || dept.includes(norm(a.unitName))),
      );
      if (byUnit) return byUnit.id;
      // Departments are often only in the agreement's NAME, not a unit row.
      const byName = agreements.filter((a) => a.status === "active" && norm(a.name).includes(dept));
      if (byName.length === 1) return byName[0].id;
    }
    const active = agreements.filter((a) => a.status === "active");
    return active.length === 1 ? active[0].id : NEW;
  }, [props.presetAgreementId, reading.department, agreements]);

  const initialUnit = useMemo(() => {
    const dept = reading.department ? norm(reading.department) : null;
    if (!dept) return NONE;
    return units.find((u) => norm(u.name).includes(dept) || dept.includes(norm(u.name)))?.id ?? NONE;
  }, [reading.department, units]);

  const [target, setTarget] = useState(initialTarget);
  const [newName, setNewName] = useState(
    [props.organizationName, reading.department].filter(Boolean).join(" – "),
  );
  const [unitId, setUnitId] = useState(initialUnit);
  const [contractType, setContractType] = useState<string>(contractTypeOf(reading) ?? NONE);
  const [signedOn, setSignedOn] = useState(reading.signed_on ?? "");
  const [signatories, setSignatories] = useState(reading.signatories ?? "");
  const [price, setPrice] = useState(() => {
    const p = yearlyPriceOf(reading);
    return p == null ? "" : String(p);
  });
  const [hasGps, setHasGps] = useState(reading.has_gps === true);
  const [startDate, setStartDate] = useState(reading.signed_on ?? today);
  const [rows, setRows] = useState<Row[]>(() =>
    matches.map((m) => ({
      bikeId: m.bike?.id ?? null,
      include:
        m.kind === "customer" &&
        (!m.activeLine || m.activeLine.agreement_id === initialTarget),
    })),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [rereading, setRereading] = useState(false);

  const targetId = target === NEW ? null : target;
  const bikeById = useMemo(() => {
    const map = new Map<string, NonNullable<FrameMatch["bike"]>>();
    for (const m of matches) {
      if (m.bike) map.set(m.bike.id, m.bike);
      for (const s of m.suggestions) map.set(s.id, s);
    }
    return map;
  }, [matches]);

  const chosen = rows
    .map((r, i) => ({ ...r, match: matches[i] }))
    .filter((r) => r.include && r.bikeId);
  const alreadyHere = (m: FrameMatch) => m.activeLine != null && m.activeLine.agreement_id === targetId;
  const toMove = chosen.filter((r) => r.match.activeLine && !alreadyHere(r.match) && r.bikeId === r.match.bike?.id);
  const toAdd = chosen.filter((r) => !(r.match.bike && alreadyHere(r.match) && r.bikeId === r.match.bike.id));

  function setRow(i: number, patch: Partial<Row>) {
    setRows((cur) => cur.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  function confirm() {
    setError(null);
    const priceNum = price.trim() === "" ? null : Number(price.replace(",", "."));
    if (priceNum != null && !Number.isFinite(priceNum)) {
      setError(t("priceInvalid"));
      return;
    }
    startTransition(async () => {
      const r = await confirmAgreementDocument(props.documentId, {
        target:
          target === NEW
            ? { kind: "new", name: newName, unitId: unitId === NONE ? null : unitId }
            : { kind: "existing", agreementId: target },
        contractType: contractType === NONE ? null : contractType,
        signedOn: signedOn || null,
        signatories: signatories || null,
        yearlyPrice: priceNum,
        hasGps,
        startDate,
        bikeIds: toAdd.map((r) => r.bikeId as string),
        moveBikeIds: toMove.map((r) => r.bikeId as string),
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push(`/service-agreements/${r.agreementId}`);
    });
  }

  async function readAgain() {
    setError(null);
    setRereading(true);
    try {
      await fetch(`/api/agreement-documents/${props.documentId}/read`, { method: "POST" });
    } finally {
      setRereading(false);
      // The route writes the document but revalidates nothing.
      router.refresh();
    }
  }

  function remove() {
    if (!window.confirm(t("deleteConfirm"))) return;
    startTransition(async () => {
      const r = await deleteAgreementDocument(props.documentId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push(`/organizations/${r.organizationId}`);
    });
  }

  const lowConfidence = reading.confidence === "low";
  // A yearly figure this low is a monthly one (142 kr × 12 = 1 704 kr) — the
  // commonest misreading, so it is called out rather than trusted.
  const priceValue = Number(price.replace(",", "."));
  const looksMonthly = price.trim() !== "" && Number.isFinite(priceValue) && priceValue > 0 && priceValue < 600;

  return (
    <div className="flex flex-col gap-6">
      {props.status === "failed" ? (
        <div className="bg-alert-wash text-alert flex flex-col gap-2 rounded-2xl p-4 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4" aria-hidden /> {t("readFailed")}
          </p>
          {props.readError ? <p className="font-mono text-xs break-all">{props.readError}</p> : null}
          <p>{t("readFailedHint")}</p>
        </div>
      ) : reading.remarks || lowConfidence ? (
        <div className="bg-money-wash flex flex-col gap-1 rounded-2xl p-4 text-sm">
          <p className="text-money flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4" aria-hidden />
            {lowConfidence ? t("lowConfidence") : t("remarksTitle")}
          </p>
          {reading.remarks ? <p>{reading.remarks}</p> : null}
        </div>
      ) : null}

      <Panel title={t("agreementTitle")} description={t("agreementDesc")} contentClassName="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label={t("fldTarget")} htmlFor="doc-target">
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger id="doc-target">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {agreements.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                    {a.unitName ? ` · ${a.unitName}` : ""}
                    {a.status !== "active" ? ` (${a.status})` : ""}
                  </SelectItem>
                ))}
                <SelectItem value={NEW}>{t("newAgreement")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        {target === NEW ? (
          <>
            <Field label={t("fldName")} htmlFor="doc-name" required>
              <Input id="doc-name" value={newName} onChange={(e) => setNewName(e.target.value)} />
            </Field>
            <Field
              label={t("fldDepartment")}
              htmlFor="doc-unit"
              hint={reading.department ? t("paperSays", { value: reading.department }) : null}
            >
              <Select value={unitId} onValueChange={setUnitId}>
                <SelectTrigger id="doc-unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t("wholeCustomer")}</SelectItem>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </>
        ) : null}
        <Field label={t("fldContractType")} htmlFor="doc-k" hint={t("contractTypeHint")}>
          <Select value={contractType} onValueChange={setContractType}>
            <SelectTrigger id="doc-k">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t("noContractType")}</SelectItem>
              {CONTRACT_TYPES.map((k) => (
                <SelectItem key={k} value={k}>
                  {t(`contractType.${k}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={t("fldSignedOn")} htmlFor="doc-signed">
          <Input id="doc-signed" type="date" value={signedOn} onChange={(e) => setSignedOn(e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <Field label={t("fldSignatories")} htmlFor="doc-signatories">
            <Input id="doc-signatories" value={signatories} onChange={(e) => setSignatories(e.target.value)} />
          </Field>
        </div>
      </Panel>

      <Panel title={t("linesTitle")} description={t("linesDesc")} contentClassName="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label={t("fldYearlyPrice")}
            htmlFor="doc-price"
            hint={
              reading.price_amount != null && reading.price_period === "month"
                ? t("monthlyOnPaper", { amount: reading.price_amount })
                : null
            }
            error={looksMonthly ? t("looksMonthly", { yearly: Number(price.replace(",", ".")) * 12 }) : null}
          >
            <Input
              id="doc-price"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="1704"
            />
          </Field>
          <Field label={t("fldStartDate")} htmlFor="doc-start" hint={t("startDateHint")}>
            <Input id="doc-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" checked={hasGps} onChange={(e) => setHasGps(e.target.checked)} className="size-4" />
            {t("fldGps")}
          </label>
        </div>

        {matches.length === 0 ? (
          <p className="bg-ground text-muted-foreground rounded-lg p-4 text-sm">{t("noFrames")}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {matches.map((m, i) => {
              const row = rows[i];
              const here = alreadyHere(m) && row.bikeId === m.bike?.id;
              const picked = row.bikeId ? bikeById.get(row.bikeId) : null;
              return (
                <li key={`${m.raw}-${i}`} className="bg-ground flex flex-col gap-1.5 rounded-lg px-3 py-2 text-sm">
                  <label className="flex min-w-0 flex-1 items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 shrink-0"
                      checked={row.include && !here}
                      disabled={!row.bikeId || here}
                      onChange={(e) => setRow(i, { include: e.target.checked })}
                      aria-label={t("includeFrame", { frame: m.raw })}
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="font-mono">{m.raw}</span>
                      {m.description ? <span className="text-muted-foreground text-xs">{m.description}</span> : null}
                    </span>
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5 pl-6">
                    {m.kind === "customer" ? (
                      <Badge variant="success">{t("match.customer")}</Badge>
                    ) : m.kind === "other_customer" ? (
                      <Badge variant="warning">{t("match.otherCustomer", { owner: m.bike?.owner_name ?? "—" })}</Badge>
                    ) : m.kind === "no_owner" ? (
                      <Badge variant="warning">{t("match.noOwner")}</Badge>
                    ) : (
                      <Badge variant="destructive">{t("match.notFound")}</Badge>
                    )}
                    {here ? (
                      <Badge variant="outline">{t("match.alreadyHere")}</Badge>
                    ) : m.activeLine && row.bikeId === m.bike?.id ? (
                      <Badge variant="warning">
                        {row.include
                          ? t("match.willMove", { agreement: m.activeLine.agreement_name })
                          : t("match.onOther", { agreement: m.activeLine.agreement_name })}
                      </Badge>
                    ) : null}
                    {m.bike ? (
                      <Link href={`/bikes/${m.bike.id}`} className="text-muted-foreground text-xs hover:underline" target="_blank">
                        {t("openBike")}
                      </Link>
                    ) : null}
                    {m.kind === "not_found" && m.suggestions.length > 0 ? (
                      <Select
                        value={row.bikeId ?? NONE}
                        onValueChange={(v) =>
                          setRow(i, v === NONE ? { bikeId: null, include: false } : { bikeId: v, include: true })
                        }
                      >
                        <SelectTrigger className="h-8 w-auto text-xs" aria-label={t("didYouMean")}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>{t("didYouMean")}</SelectItem>
                          {m.suggestions.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.frame_number}
                              {s.owner_name ? ` · ${s.owner_name}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : null}
                    {m.kind === "not_found" && picked ? (
                      <span className="text-muted-foreground text-xs">{t("picked", { frame: picked.frame_number })}</span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void readAgain()} disabled={pending || rereading}>
            {rereading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}
            {rereading ? t("readingNowShort") : t("readAgain")}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={remove} disabled={pending || rereading}>
            <Trash2 className="size-4" aria-hidden /> {t("delete")}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-muted-foreground text-sm">
            {t("summary", { add: toAdd.length, move: toMove.length })}
          </span>
          <Button type="button" onClick={confirm} disabled={pending || rereading}>
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {t("confirm")}
          </Button>
        </div>
      </div>
    </div>
  );
}
