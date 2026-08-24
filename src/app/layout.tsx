import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";

import { AppSidebar } from "@/components/app-sidebar";
import { MobileNav } from "@/components/mobile-nav";
import {
  NAV_GROUPS,
  NAV_GROUP_IDS,
  isGroupActive,
} from "@/components/nav-items";
import { RegisterSW } from "@/components/register-sw";
import { ScanFab } from "@/components/scan-fab";
import { DbTargetBanner } from "@/components/db-target-banner";
import { readGate } from "@/lib/auth/read-session";
import {
  parsePreferences,
  resolveOpenGroups,
  EMPTY_PREFERENCES,
} from "@/lib/people/preferences";
import { createClient } from "@/lib/supabase/server";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Jensen FMS",
  description: "Fleet management for Jensen Production / Logocykler.",
  applicationName: "Jensen FMS",
  manifest: "/manifest.webmanifest",
  // iOS-specific: enable standalone-mode launch from "Add to Home Screen"
  // and tell iOS what to show on the splash + status bar.
  appleWebApp: {
    capable: true,
    title: "Jensen FMS",
    statusBarStyle: "default",
  },
  // Square assets generated from public/logo-jensen.webp (Jensen lockup
  // centred on a white square). PWA + Apple need different sizes.
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: { url: "/apple-touch-icon.png", sizes: "180x180" },
  },
  // Don't index the workshop tool.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  // Brand blue (--brand) — used by Android Chrome's address bar and the PWA
  // splash. Keep in step with `theme_color` in public/manifest.webmanifest
  // and `--brand` in globals.css; the three are one decision.
  themeColor: "#2e5fd1",
  // Keep the viewport pinned so the iPhone form-zoom doesn't fight us.
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Locale + messages resolved per request from app_settings (worker
  // surfaces follow worker_language) — see src/i18n/request.ts.
  const locale = await getLocale();
  const messages = await getMessages();
  // Session capability scope for the app chrome. null = nothing scoped
  // (gate off). Every session carries a person (migration 80), so the chip
  // names whoever is logged in — including the shared Admin account.
  const gate = await readGate();
  const allowedCaps = gate.kind === "session" ? gate.session.caps : null;
  const showPersonChip = gate.kind === "session";
  let personName: string | null = null;
  let preferences = EMPTY_PREFERENCES;
  if (gate.kind === "session") {
    const supabase = await createClient();
    const { data } = await supabase
      .from("people")
      .select("full_name, ui_preferences")
      .eq("id", gate.session.person)
      .maybeSingle();
    personName = data?.full_name ?? null;
    preferences = parsePreferences(data?.ui_preferences);
  }

  // Sidebar group state, resolved HERE rather than on the client: the rail is
  // server-rendered, so applying a stored preference after hydration would
  // shift the layout on every navigation. It comes off the PERSON (migration
  // 81), so it follows them between devices. `x-pathname` is stamped by
  // src/middleware.ts (already used for the worker-locale split).
  const pathname = (await headers()).get("x-pathname") ?? "/";
  const openGroups = resolveOpenGroups(
    preferences.navOpen,
    NAV_GROUP_IDS,
    // Default for a group nobody has expressed an opinion about: open the one
    // holding the current page. Only ever applies to groups the person has
    // never touched — once someone closes a group, navigating into it must not
    // reopen it, or a dashboard link would undo their setting.
    (id) => {
      const group = NAV_GROUPS.find((g) => g.id === id);
      return group ? isGroupActive(group, pathname) : false;
    },
  );

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="bg-background text-foreground min-h-full">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <div className="flex min-h-screen">
            <AppSidebar
              allowedCaps={allowedCaps}
              showPersonChip={showPersonChip}
              personName={personName}
              initialOpenGroups={openGroups}
              initialCollapsed={preferences.navCollapsed}
            />
            <div className="flex min-w-0 flex-1 flex-col">
              <MobileNav
                allowedCaps={allowedCaps}
                showPersonChip={showPersonChip}
                personName={personName}
                initialOpenGroups={openGroups}
              />
              {/* pb-20 on small screens reserves space below scrollable
                  content so the floating Scan FAB never overlaps a card,
                  table row, or button at the page footer. md+ uses no
                  extra padding since the sidebar lives there instead. */}
              <main className="flex flex-1 flex-col pb-20 md:pb-0">
                {children}
              </main>
            </div>
          </div>
          <ScanFab allowedCaps={allowedCaps} />
          <DbTargetBanner />
          <RegisterSW />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
