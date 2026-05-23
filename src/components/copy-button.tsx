"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Generic "copy this to clipboard" button. Shows a checkmark for ~1.5s
 * after a successful copy so staff get visual confirmation without a
 * toast system.
 */
export function CopyButton({
  value,
  label = "Copy",
  className,
  size = "sm",
  variant = "outline",
}: {
  value: string;
  label?: string;
  className?: string;
  size?: "sm" | "default" | "lg" | "icon" | "icon-sm";
  variant?:
    | "default"
    | "outline"
    | "ghost"
    | "secondary"
    | "destructive"
    | "link";
}) {
  const [copied, setCopied] = useState(false);

  async function onClick() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard write can fail in insecure contexts or older browsers —
      // fall back to a one-time prompt so the user can copy manually.
      window.prompt("Copy:", value);
    }
  }

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      onClick={onClick}
      className={cn(className)}
    >
      {copied ? (
        <>
          <Check className="size-4" aria-hidden /> Copied
        </>
      ) : (
        <>
          <Copy className="size-4" aria-hidden /> {label}
        </>
      )}
    </Button>
  );
}
