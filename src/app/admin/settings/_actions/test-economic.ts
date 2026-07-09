"use server";

import { economicFetch } from "@/lib/economic/client";

export type EconomicProbe =
  | {
      ok: true;
      company: string;
      agreementNumber: number;
      journals: { number: number; name: string }[];
      accountingYears: string[];
    }
  | { ok: false; error: string };

/**
 * Read-only connection probe for the admin Accounting card: confirms the
 * env tokens work and lists the journals + accounting years on the
 * agreement so the owner can copy the right numbers into the config.
 */
export async function testEconomicConnection(): Promise<EconomicProbe> {
  const self = await economicFetch<{
    agreementNumber: number;
    company?: { name?: string };
  }>("/self");
  if (!self.ok) return { ok: false, error: self.error };

  const [journals, years] = await Promise.all([
    economicFetch<{ collection: { journalNumber: number; name: string }[] }>(
      "/journals?pagesize=20",
    ),
    economicFetch<{ collection: { year: string; closed?: boolean }[] }>(
      "/accounting-years?pagesize=20",
    ),
  ]);

  return {
    ok: true,
    company: self.data.company?.name ?? "(unnamed company)",
    agreementNumber: self.data.agreementNumber,
    journals: journals.ok
      ? journals.data.collection.map((j) => ({
          number: j.journalNumber,
          name: j.name,
        }))
      : [],
    accountingYears: years.ok
      ? years.data.collection.filter((y) => !y.closed).map((y) => y.year)
      : [],
  };
}
