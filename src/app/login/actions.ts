"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { AUTH_COOKIE, LAST_PERSON_COOKIE, safeNextPath } from "@/lib/auth/gate";
import { signSession, type AppSession } from "@/lib/auth/session";
import { ALL_CAPABILITIES } from "@/lib/people/capabilities";
import { verifyPassword } from "@/lib/people/password";
import {
  loadAdminPerson,
  loadLoginPeople,
  loadPersonAccess,
} from "@/lib/people/queries";
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
 * Person login (migration 80). You pick a NAME and type that person's own
 * password; the session carries who you are, so every assignment and every
 * future actor column can name a human from the first login onward.
 *
 * "Admin" is the one shared account: authenticated by SITE_PASSWORD (not by
 * a hash of its own) and granted every capability, but it is still a real
 * `people` row, so work done on it reads as "Admin" rather than as nobody.
 *
 * Wrong name and wrong password return the same message on purpose — the
 * dropdown already lists the names, but the error shouldn't confirm which
 * half was wrong.
 */
export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const personId = String(formData.get("person_id") ?? "");
  const password = String(formData.get("password") ?? "");
  const nextRaw = String(formData.get("next") ?? "");
  const next = safeNextPath(nextRaw);

  const expected = process.env.SITE_PASSWORD;
  if (!expected) redirect(next);

  const t = await getTranslations("auth");
  const supabase = await createClient();

  let session: AppSession | null = null;
  const admin = await loadAdminPerson(supabase);

  if (admin && personId === admin.id) {
    if (password !== expected) return { error: t("wrongPassword") };
    session = {
      v: 1,
      role: "admin",
      caps: [...ALL_CAPABILITIES],
      home: "/",
      person: admin.id,
    };
  } else {
    // Only names the login screen actually offers — engaged today, active,
    // password set, at least one role. Re-checked here because the form
    // posts an id.
    const people = await loadLoginPeople(supabase);
    if (!people.some((p) => p.id === personId)) {
      return { error: t("wrongPassword") };
    }

    const { data: person } = await supabase
      .from("people")
      .select("password_hash")
      .eq("id", personId)
      .maybeSingle();
    if (
      !person?.password_hash ||
      !(await verifyPassword(password, person.password_hash))
    ) {
      return { error: t("wrongPassword") };
    }

    const access = await loadPersonAccess(supabase, personId);
    if (!access) return { error: t("wrongPassword") };
    session = {
      v: 1,
      role: access.role,
      caps: access.caps,
      home: access.home,
      person: personId,
    };
  }

  const jar = await cookies();
  jar.set(AUTH_COOKIE, await signSession(session, expected), COOKIE_OPTIONS);
  // Remember the name for next time on this device. Not httpOnly-sensitive
  // either way, but it stays server-only for consistency with the session.
  jar.set(LAST_PERSON_COOKIE, session.person, {
    ...COOKIE_OPTIONS,
    maxAge: 60 * 60 * 24 * 365,
  });

  // A deep link (?next=) wins; otherwise land on the role's home page.
  // Middleware bounces uncapable targets to home, so no capability check
  // is needed here.
  redirect(nextRaw && next !== "/" ? next : session.home);
}
