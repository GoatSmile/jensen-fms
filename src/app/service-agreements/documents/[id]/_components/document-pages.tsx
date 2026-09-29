import { getTranslations } from "next-intl/server";
import { ExternalLink, FileText } from "lucide-react";

import { Panel } from "@/components/ui/panel";

export type PageView = {
  id: string;
  url: string | null;
  name: string;
  isPdf: boolean;
};

/** The paper itself, page by page — what every field on the right is checked against. */
export async function DocumentPages({ pages }: { pages: PageView[] }) {
  const t = await getTranslations("agreementDocs");
  return (
    <Panel title={t("pagesTitle")} description={t("pagesDesc", { count: pages.length })} contentClassName="flex flex-col gap-3">
      {pages.length === 0 ? (
        <p className="bg-ground text-muted-foreground rounded-lg p-4 text-sm">{t("noPages")}</p>
      ) : (
        pages.map((p, i) =>
          !p.url ? (
            <p key={p.id} className="bg-ground text-alert rounded-lg p-4 text-sm">
              {t("pageUnavailable", { n: i + 1 })}
            </p>
          ) : p.isPdf ? (
            <div key={p.id} className="flex flex-col gap-2">
              <iframe
                src={p.url}
                title={p.name}
                className="bg-ground hidden h-[70vh] w-full rounded-lg sm:block"
              />
              <a
                href={p.url}
                target="_blank"
                rel="noreferrer"
                className="bg-ground flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:underline"
              >
                <FileText className="size-4" aria-hidden /> {t("openPdf", { name: p.name })}
                <ExternalLink className="size-3.5" aria-hidden />
              </a>
            </div>
          ) : (
            <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element -- a signed, expiring URL; next/image would cache it */}
              <img src={p.url} alt={t("pageN", { n: i + 1 })} className="bg-ground w-full rounded-lg" />
            </a>
          ),
        )
      )}
    </Panel>
  );
}
