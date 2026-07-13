"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { AUTH_COOKIE, passwordToken, safeNextPath } from "@/lib/auth/gate";

export type LoginState = { error: string | null };

/**
 * Validate the shared password and, on success, set the auth cookie and send
 * the user where they were headed. With no SITE_PASSWORD set the gate is off, so
 * we just let them through.
 */
export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(String(formData.get("next") ?? "/"));

  const expected = process.env.SITE_PASSWORD;
  if (!expected) redirect(next);
  if (password !== expected) {
    const t = await getTranslations("auth");
    return { error: t("wrongPassword") };
  }

  const jar = await cookies();
  jar.set(AUTH_COOKIE, await passwordToken(expected), {
    httpOnly: true,
    sameSite: "lax",
    // localhost is http in dev — a secure cookie wouldn't stick there.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  redirect(next);
}
