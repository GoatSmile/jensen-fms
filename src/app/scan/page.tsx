import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";

import { InstallHint } from "./_components/install-hint";
import { Scanner } from "./_components/scanner";

/**
 * Full-screen-ish scan page. Renders on a phone or any browser with a
 * camera. The actual scanner is a client component because it touches
 * navigator.mediaDevices.getUserMedia.
 */
export default function ScanPage() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/">
            <ArrowLeft aria-hidden /> Back
          </Link>
        </Button>
        <h1 className="text-base font-semibold">Scan QR sticker</h1>
        <span className="size-8" aria-hidden />
      </div>
      <Scanner />
      <p className="text-muted-foreground text-center text-xs">
        Point the back camera at any Jensen bike sticker. The page will
        navigate as soon as the code is recognised.
      </p>
      <InstallHint />
    </div>
  );
}
