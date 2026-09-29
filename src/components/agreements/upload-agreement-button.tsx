"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Camera, FileText, FileUp, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { resizeImageForUpload, toUploadFile } from "@/lib/parts/image";
import {
  MAX_DOCUMENT_FILES,
  isDocumentMime,
} from "@/lib/service-agreements/documents/storage";
import {
  finishAgreementDocument,
  startAgreementDocument,
} from "@/app/service-agreements/_actions/documents";

/** A scanned page must stay legible to the reader: larger than a bike photo. */
const PAGE_MAX_EDGE = 2400;
const PAGE_QUALITY = 0.85;

type Page = { key: string; file: File; preview: string | null };

/**
 * *Upload agreement* — a signed service agreement from Dennis's phone
 * (migration 110). *Take photo* opens the rear camera straight away, one page
 * per shot, as many pages as the paper has; *Choose file* takes a PDF or
 * photos from the library. Photos are downscaled in the browser (EXIF, GPS
 * included, is dropped); every file goes straight to the private bucket with a
 * signed URL, then the review page reads it.
 *
 * Word files are refused here and on the server: the reader cannot open
 * .docx, so it has to be saved as PDF first.
 */
export function UploadAgreementButton({
  organizationId,
  agreementId,
  variant = "outline",
}: {
  organizationId: string;
  /** When uploading from an agreement's own page, the target is known. */
  agreementId?: string;
  variant?: "default" | "outline";
}) {
  const t = useTranslations("agreementDocs");
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [pages, setPages] = useState<Page[]>([]);
  const [busy, setBusy] = useState<null | "preparing" | "uploading">(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    for (const p of pages) if (p.preview) URL.revokeObjectURL(p.preview);
    setPages([]);
    setError(null);
    setBusy(null);
  }

  async function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setError(null);
    setBusy("preparing");
    const next: Page[] = [];
    try {
      for (const file of Array.from(list)) {
        if (/\.docx?$/i.test(file.name) || file.type.includes("word")) {
          setError(t("wordNotSupported", { name: file.name }));
          continue;
        }
        if (file.type === "application/pdf") {
          next.push({ key: crypto.randomUUID(), file, preview: null });
          continue;
        }
        if (file.type && !file.type.startsWith("image/")) {
          setError(t("badType", { name: file.name }));
          continue;
        }
        const resized = toUploadFile(
          file.name || "page.jpg",
          await resizeImageForUpload(file, PAGE_MAX_EDGE, PAGE_QUALITY),
        );
        next.push({ key: crypto.randomUUID(), file: resized, preview: URL.createObjectURL(resized) });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("prepareFailed"));
    } finally {
      setBusy(null);
    }
    setPages((cur) => [...cur, ...next].slice(0, MAX_DOCUMENT_FILES));
  }

  function removePage(key: string) {
    setPages((cur) => {
      const p = cur.find((x) => x.key === key);
      if (p?.preview) URL.revokeObjectURL(p.preview);
      return cur.filter((x) => x.key !== key);
    });
  }

  async function upload() {
    if (pages.length === 0) return;
    setError(null);
    setBusy("uploading");
    try {
      const files = pages.map((p) => ({ name: p.file.name, type: p.file.type, size: p.file.size }));
      if (files.some((f) => !isDocumentMime(f.type))) {
        setError(t("badType", { name: files.find((f) => !isDocumentMime(f.type))?.name ?? "" }));
        return;
      }
      const started = await startAgreementDocument(organizationId, files, agreementId ?? null);
      if (!started.ok) {
        setError(started.error);
        return;
      }
      for (const [i, u] of started.uploads.entries()) {
        const res = await fetch(u.signedUrl, {
          method: "PUT",
          headers: { "content-type": pages[i].file.type },
          body: pages[i].file,
        });
        if (!res.ok) {
          setError(t("uploadFailed", { name: pages[i].file.name }));
          return;
        }
      }
      const finished = await finishAgreementDocument(
        started.documentId,
        started.uploads.map((u, i) => ({ ...files[i], path: u.path })),
      );
      if (!finished.ok) {
        setError(finished.error);
        return;
      }
      reset();
      setOpen(false);
      router.push(`/service-agreements/documents/${started.documentId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("prepareFailed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Button type="button" size="sm" variant={variant} onClick={() => setOpen(true)}>
        <FileUp className="size-4" aria-hidden /> {t("upload")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (busy === "uploading") return;
          if (!next) reset();
          setOpen(next);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("uploadTitle")}</DialogTitle>
            <DialogDescription>{t("uploadDesc")}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => cameraRef.current?.click()}
              disabled={busy !== null || pages.length >= MAX_DOCUMENT_FILES}
            >
              <Camera className="size-4" aria-hidden />
              {pages.length === 0 ? t("takePhoto") : t("addPage")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={busy !== null || pages.length >= MAX_DOCUMENT_FILES}
            >
              <FileText className="size-4" aria-hidden /> {t("chooseFile")}
            </Button>
            {/* `capture` opens the rear camera directly — one page per shot.
                The second input has none, so it offers the library, Files and
                PDFs. */}
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                void addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                void addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          {pages.length > 0 ? (
            <ol className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {pages.map((p, i) => (
                <li key={p.key} className="bg-ground relative flex flex-col gap-1 rounded-lg p-1.5">
                  {p.preview ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a local blob preview, not a remote image
                    <img
                      src={p.preview}
                      alt={t("pageN", { n: i + 1 })}
                      className="aspect-[3/4] w-full rounded-md object-cover"
                    />
                  ) : (
                    <div className="text-muted-foreground flex aspect-[3/4] w-full flex-col items-center justify-center gap-1 rounded-md bg-surface text-xs">
                      <FileText className="size-6" aria-hidden />
                      PDF
                    </div>
                  )}
                  <span className="text-muted-foreground truncate text-xs">
                    {t("pageN", { n: i + 1 })}
                  </span>
                  <button
                    type="button"
                    onClick={() => removePage(p.key)}
                    disabled={busy !== null}
                    className="bg-surface absolute top-2.5 right-2.5 rounded-full p-1 shadow-popover"
                    aria-label={t("removePage", { n: i + 1 })}
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="bg-ground text-muted-foreground rounded-lg p-4 text-sm">{t("noPagesYet")}</p>
          )}

          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              onClick={() => void upload()}
              disabled={pages.length === 0 || busy !== null}
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {busy === "uploading"
                ? t("uploading")
                : busy === "preparing"
                  ? t("preparing")
                  : t("uploadAndRead", { count: pages.length })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
