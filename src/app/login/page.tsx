import { getTranslations } from "next-intl/server";

import { Logo } from "@/components/logo";

import { LoginForm } from "./login-form";

/**
 * Shared-password login screen. Rendered chrome-free (AppSidebar / MobileNav /
 * ScanFab all hide on /login). The gate that redirects here lives in
 * src/middleware.ts and only engages when SITE_PASSWORD is set.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const t = await getTranslations("auth");

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-3">
          <Logo heightClass="h-12" />
          <p className="text-muted-foreground text-sm">{t("signInPrompt")}</p>
        </div>
        <div className="bg-card rounded-lg border p-5 shadow-sm">
          <LoginForm next={next ?? "/"} />
        </div>
      </div>
    </div>
  );
}
