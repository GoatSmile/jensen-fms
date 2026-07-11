"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Camera, ImageOff, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { resizeImageForUpload, toUploadFile } from "@/lib/parts/image";

import { uploadWorkOrderImage } from "../_actions/upload-wo-image";
import { deleteWorkOrderImage } from "../_actions/delete-wo-image";

export type WOPhoto = {
  id: string;
  fileUrl: string;
  fileName: string | null;
};

type Props = {
  woId: string;
  photos: WOPhoto[];
  readOnly: boolean;
};

/**
 * Quick-photo capture for the technician workspace. Tap the button →
 * native camera picker → client-side resize to ~1600px WebP → upload to
 * Supabase Storage → attachments row written with entity_type='work_order'.
 *
 * Reuses the same `resizeImageForUpload` helper as bikes/parts photo
 * uploads so we keep one resize codepath.
 */
export function PhotosSection({ woId, photos, readOnly }: Props) {
  const t = useTranslations("wo");
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, startDelete] = useTransition();

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const resized = toUploadFile(file.name, await resizeImageForUpload(file));
      const fd = new FormData();
      fd.set("woId", woId);
      fd.set("file", resized);
      const r = await uploadWorkOrderImage(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("photoProcessError"));
    } finally {
      setUploading(false);
    }
  }

  function onDelete(attachmentId: string) {
    setError(null);
    setDeletingId(attachmentId);
    startDelete(async () => {
      const r = await deleteWorkOrderImage(attachmentId, woId);
      setDeletingId(null);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="bg-card flex flex-col gap-3 rounded-md border border-l-[3px] border-l-slate-600 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Camera className="size-4 text-slate-600" aria-hidden />
          <h2 className="text-sm font-semibold">{t("photosTitle")}</h2>
          <span className="text-muted-foreground text-xs">
            {photos.length === 0
              ? t("noneYet")
              : t("photoCount", { count: photos.length })}
          </span>
        </div>
        {!readOnly ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />{" "}
                {t("uploading")}
              </>
            ) : (
              <>
                <Camera className="size-4" aria-hidden /> {t("takePhoto")}
              </>
            )}
          </Button>
        ) : null}
        {/* No `capture` attr — with it, iOS forces the camera and blocks
            the photo library; without it the OS sheet offers both "Take
            photo" and gallery, which is what the tech actually needs. */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onFile}
        />
      </div>

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {photos.length === 0 ? (
        <div className="text-muted-foreground flex items-center gap-2 py-2 text-sm italic">
          <ImageOff className="size-4" aria-hidden />
          {t("photosEmpty")}
        </div>
      ) : (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((p) => (
            <li key={p.id} className="group relative">
              <a
                href={p.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block overflow-hidden rounded-md border"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- Public Supabase storage URL; Next/Image not configured for that domain. */}
                <img
                  src={p.fileUrl}
                  alt={p.fileName ?? t("photoAlt")}
                  className="aspect-square w-full object-cover"
                />
              </a>
              {!readOnly ? (
                <button
                  type="button"
                  onClick={() => onDelete(p.id)}
                  disabled={deletingId === p.id}
                  className="bg-background/90 hover:bg-background absolute right-1 top-1 rounded-md border p-1 opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-50"
                  aria-label={t("removePhoto")}
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
