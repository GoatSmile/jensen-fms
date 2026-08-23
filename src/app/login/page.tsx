import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";

import { Logo } from "@/components/logo";
import { LAST_PERSON_COOKIE } from "@/lib/auth/gate";
import { loadAdminPerson, loadLoginPeople } from "@/lib/people/queries";
import { createClient } from "@/lib/supabase/server";

import { LoginForm, type LoginOption } from "./login-form";

/**
 * Login screen: pick a name, type that person's password. Admin (the shared
 * SITE_PASSWORD account) is always the first entry; below it, everyone who
 * can actually get in — engaged today, active, password set, holding a role.
 * The name preselected is whoever logged in last ON THIS DEVICE
 * (`fms_last_person`), so the shop tablet opens on the person who uses it.
 *
 * Rendered chrome-free (AppSidebar / MobileNav / ScanFab all hide on
 * /login). The gate that redirects here lives in src/middleware.ts and only
 * engages when SITE_PASSWORD is set.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const t = await getTranslations("auth");

  const supabase = await createClient();
  const [admin, people] = await Promise.all([
    loadAdminPerson(supabase),
    loadLoginPeople(supabase),
  ]);
  const options: LoginOption[] = [...(admin ? [admin] : []), ...people];

  // Preselect whoever logged in last on this device — but only if they are
  // still offered: a person can lose their password, their roles or their
  // engagement between logins, and a preselected name that can't log in is
  // worse than no preselection.
  const remembered = (await cookies()).get(LAST_PERSON_COOKIE)?.value;
  const initialPersonId =
    remembered && options.some((o) => o.id === remembered)
      ? remembered
      : (options[0]?.id ?? "");

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-3">
          <Logo heightClass="h-12" />
          <p className="text-muted-foreground text-sm">{t("signInPrompt")}</p>
        </div>
        <div className="bg-card rounded-lg border p-5 shadow-sm">
          <LoginForm
            next={next ?? "/"}
            options={options}
            initialPersonId={initialPersonId}
          />
        </div>
      </div>
    </div>
  );
}
