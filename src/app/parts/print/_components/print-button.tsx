"use client";

import { useTranslations } from "next-intl";
import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Tiny client-side wrapper around `window.print()` so the print page can stay
 * a Server Component and still expose a "Print" trigger in its header.
 */
export function PrintButton() {
  const t = useTranslations("parts");
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => window.print()}
      className="print-hidden"
    >
      <Printer aria-hidden /> {t("print")}
    </Button>
  );
}
