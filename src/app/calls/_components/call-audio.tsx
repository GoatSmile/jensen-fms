"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Play } from "lucide-react";

import { Button } from "@/components/ui/button";

import { getCallAudioUrl } from "../_actions/audio-url";

/**
 * The recording, fetched on demand: the signed link is minted when the
 * person presses play, so a list of many calls signs nothing up front.
 */
export function CallAudio({ messageId }: { messageId: string }) {
  const t = useTranslations("calls");
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (url) {
    return (
      <audio controls autoPlay preload="auto" src={url} className="w-full" />
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await getCallAudioUrl(messageId);
            if (r.ok) setUrl(r.url);
            else setError(r.error);
          })
        }
      >
        <Play className="size-4" aria-hidden />
        {pending ? t("audioLoading") : t("audioPlay")}
      </Button>
      {error ? <span className="text-destructive text-sm">{error}</span> : null}
    </div>
  );
}
