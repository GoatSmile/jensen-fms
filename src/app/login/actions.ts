"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { AUTH_COOKIE, passwordToken, safeNextPath } from "@/lib/auth/gate";
import { signSession, type RoleSession } from "@/lib/auth/session";
import { isCapability } from "@/lib/people/capabilities";
import { verifyPassword } from "@/lib/people/password";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error: string | null };

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  // localhost is http in dev — a secure cookie wouldn't stick there.
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 30, // 30 days
} as const;

/**
 * Role-password login (auth v0.5, people & roles P2). One password field,
 * no role picker — the entered password IS the role selector: it's
 * scrypt-checked against every active role's hash. SITE_PASSWORD keeps
 * working as the owner-role fallback during cutover (and stays the gate's
 * opt-in switch: unset ⇒ nothing is locked).
 */
export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const password = String(formData.get("password") ?? "");
  const nextRaw = String(formData.get("next") ?? "");
  const next = safeNextPath(nextRaw);

  const expected = process.env.SITE_PASSWORD;
  if (!expected) redirect(next);

  const supabase = await createClient();
  let role: { id: string; key: string; home_path: string } | null = null;

  if (password === expected) {
    // Shared-password fallback → the owner role. If the owner role is
    // somehow missing/archived, fall back to the legacy full-access token
    // so the shared password can never lock the shop out.
    const { data } = await supabase
      .from("roles")
      .select("id, key, home_path")
      .eq("key", "owner")
      .eq("is_active", true)
      .maybeSingle();
    if (!data) {
      const jar = await cookies();
      jar.set(AUTH_COOKIE, await passwordToken(expected), COOKIE_OPTIONS);
      redirect(next === "/" ? "/" : next);
    }
    role = data;
  } else {
    // Password → role resolution. If two roles ever share a password the
    // lowest sort_order wins — don't do that; admin has no uniqueness
    // check because hashes can't be compared.
    const { data: candidates } = await supabase
      .from("roles")
      .select("id, key, home_path, password_hash")
      .eq("is_active", true)
      .not("password_hash", "is", null)
      .order("sort_order", { ascending: true });
    for (const candidate of candidates ?? []) {
      if (
        candidate.password_hash &&
        (await verifyPassword(password, candidate.password_hash))
      ) {
        role = candidate;
        break;
      }
    }
  }

  if (!role) {
    const t = await getTranslations("auth");
    return { error: t("wrongPassword") };
  }

  const { data: capRows } = await supabase
    .from("role_capabilities")
    .select("capability")
    .eq("role_id", role.id);
  const session: RoleSession = {
    v: 1,
    role: role.key,
    // Registry-filtered defensively — the cookie only ever carries keys
    // code enforces.
    caps: (capRows ?? []).map((c) => c.capability).filter(isCapability),
    home: role.home_path?.startsWith("/") ? role.home_path : "/",
  };

  const jar = await cookies();
  jar.set(AUTH_COOKIE, await signSession(session, expected), COOKIE_OPTIONS);

  // A deep link (?next=) wins; otherwise land on the role's home page.
  // Middleware bounces uncapable targets to home, so no capability check
  // is needed here.
  redirect(nextRaw && next !== "/" ? next : session.home);
}
