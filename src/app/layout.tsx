import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { AppSidebar } from "@/components/app-sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { RegisterSW } from "@/components/register-sw";
import { ScanFab } from "@/components/scan-fab";

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
  // Brand blue — used by Android Chrome's address bar and the PWA
  // splash background.
  themeColor: "#1e4a7a",
  // Keep the viewport pinned so the iPhone form-zoom doesn't fight us.
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="bg-background text-foreground min-h-full">
        <div className="flex min-h-screen">
          <AppSidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <MobileNav />
            <main className="flex flex-1 flex-col">{children}</main>
          </div>
        </div>
        <ScanFab />
        <RegisterSW />
      </body>
    </html>
  );
}
