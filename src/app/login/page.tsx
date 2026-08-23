import { getTranslations } from "next-intl/server";

import { Logo } from "@/components/logo";
import { loadAdminPerson, loadLoginPeople } from "@/lib/people/queries";
import { createClient } from "@/lib/supabase/server";

import { LoginForm, type LoginOption } from "./login-form";

/**
 * Login screen: pick a name, type that person's password. Admin (the shared
 * SITE_PASSWORD account) is always the first entry; below it, everyone who
 * can actually get in — engaged today, active, password set, holding a role.
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

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-3">
          <Logo heightClass="h-12" />
          <p className="text-muted-foreground text-sm">{t("signInPrompt")}</p>
        </div>
        <div className="bg-card rounded-lg border p-5 shadow-sm">
          <LoginForm next={next ?? "/"} options={options} />
        </div>
      </div>
    </div>
  );
}
