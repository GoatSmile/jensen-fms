"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { AUTH_COOKIE, safeNextPath } from "@/lib/auth/gate";
import { readGate } from "@/lib/auth/read-session";
import { signSession } from "@/lib/auth/session";
import { loadPeopleForRole } from "@/lib/people/queries";
import { createClient } from "@/lib/supabase/server";

export type ClaimResult = { ok: false; error: string };

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 30, // 30 days
} as const;

/**
 * Tap-your-name (P3): stamp the chosen person into the role session.
 * Self-claimed by design (locked 2026-07-17) — same trust level as the
 * shared password; becomes verified identity at M1. Only people who
 * actually hold the session's role are claimable.
 */
export async function claimPerson(formData: FormData): Promise<ClaimResult> {
  const personId = String(formData.get("person_id") ?? "");
  const next = safeNextPath(String(formData.get("next") ?? "/"));

  const gate = await readGate();
  const expected = process.env.SITE_PASSWORD;
  // Person identity only exists on role sessions — anyone else just
  // continues without one.
  if (gate.kind !== "role" || !expected) redirect(next);

  const supabase = await createClient();
  const claimable = await loadPeopleForRole(supabase, gate.session.role);
  if (!claimable.some((p) => p.id === personId)) {
    const t = await getTranslations("errors");
    return { ok: false, error: t("whoamiInvalidPerson") };
  }

  const jar = await cookies();
  jar.set(
    AUTH_COOKIE,
    await signSession({ ...gate.session, person: personId }, expected),
    COOKIE_OPTIONS,
  );
  redirect(next);
}
