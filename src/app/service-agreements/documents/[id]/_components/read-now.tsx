"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";

import { Panel } from "@/components/ui/panel";

/**
 * A freshly uploaded document has not been read yet: read it now, from the
 * browser, once. A client effect rather than the server render, because a
 * render can be a prefetch and the reading costs a model call. The route
 * records success or failure on the document, and the refreshed page shows
 * whichever it was — so closing the tab mid-read loses nothing but the wait.
 */
export function ReadNow({ documentId }: { documentId: string }) {
  const t = useTranslations("agreementDocs");
  const router = useRouter();
  const started = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    fetch(`/api/agreement-documents/${documentId}/read`, { method: "POST" })
      .catch(() => setFailed(true))
      .finally(() => router.refresh());
  }, [documentId, router]);

  return (
    <Panel title={t("readingTitle")}>
      <div className="bg-ground flex items-center gap-3 rounded-lg p-4 text-sm">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        {failed ? t("readingInterrupted") : t("readingNow")}
      </div>
    </Panel>
  );
}
