"use server";

import { getTranslations } from "next-intl/server";

import { listModels, testModel, type ModelOption } from "@/lib/inbound/models";

export type ModelListResult =
  | { ok: true; models: ModelOption[] }
  | { ok: false; error: string };

export type ModelTestResult = { ok: true; model: string } | { ok: false; error: string };

/** Map a discovery/probe failure onto the shared localized `errors` namespace. */
async function reasonToMessage(
  reason: "no_key" | "unsupported_provider" | "api_error",
  detail: string | undefined,
): Promise<string> {
  const t = await getTranslations("errors");
  if (reason === "no_key") return t("inboundModelNoKey");
  if (reason === "unsupported_provider") return t("inboundModelListUnsupported");
  return t("inboundModelApiError", { detail: detail ?? t("unknownError") });
}

/**
 * Live model catalogue for the admin picker (Models API). A failure here is
 * NOT fatal — the form falls back to free text, because a model id the admin
 * knows is correct must always be savable even when discovery is down.
 */
export async function fetchModelOptions(provider: string): Promise<ModelListResult> {
  const r = await listModels(provider);
  if (r.ok) return { ok: true, models: r.models };
  return { ok: false, error: await reasonToMessage(r.reason, r.detail) };
}

/**
 * Prove the chosen model works before it reaches the pipeline. Forces a tool
 * call, because that is what extraction and the command agent both depend on
 * — a model that can't be driven that way fails here rather than at 3 a.m.
 */
export async function testExtractionModel(
  provider: string,
  model: string,
): Promise<ModelTestResult> {
  const r = await testModel(provider, model);
  if (r.ok) return { ok: true, model: r.model };
  return { ok: false, error: await reasonToMessage(r.reason, r.detail) };
}
