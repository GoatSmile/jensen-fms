"use client";

import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ImagePlus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { resizeImageForUpload, toUploadFile } from "@/lib/parts/image";

import {
  removeOfferLineImage,
  uploadOfferLineImage,
} from "../../_actions/line-image";

/**
 * The picture on one offer line — what the customer sees beside the price.
 *
 * Resized in the browser before upload (the same helper the parts and
 * work-order photo sections use), so a phone photo straight off the camera
 * doesn't push megabytes through a server action.
 */
export function LineImageCell({
  lineId,
  imageUrl,
  editable,
}: {
  lineId: string;
  imageUrl: string | null;
  editable: boolean;
}) {
  const t = useTranslations("offerDetail");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onPick(file: File | undefined) {
    if (!file) return;
    setError(null);
    start(async () => {
      let upload: File;
      try {
        upload = toUploadFile(file.name, await resizeImageForUpload(file));
      } catch {
        setError(t("imageCouldNotRead"));
        return;
      }
      const fd = new FormData();
      fd.append("lineId", lineId);
      fd.append("file", upload);
      const r = await uploadOfferLineImage(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  function onRemove() {
    setError(null);
    start(async () => {
      const r = await removeOfferLineImage(lineId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  // Nothing to show and nothing to do — a sent offer whose line has no picture
  // should not carry a dead control.
  if (!imageUrl && !editable) return null;

  return (
    <div className="mt-1.5 flex flex-col gap-1">
      {imageUrl ? (
        <div className="flex items-center gap-2">
          <Image
            src={imageUrl}
            alt={t("imageAlt")}
            width={96}
            height={64}
            className="border-rule h-16 w-24 rounded-md border object-cover"
            unoptimized
          />
          {editable ? (
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={onRemove}
              disabled={pending}
              aria-label={t("imageRemove")}
            >
              <X aria-hidden />
            </Button>
          ) : null}
        </div>
      ) : (
        <div>
          <Button
            size="xs"
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={pending}
          >
            <ImagePlus aria-hidden />{" "}
            {pending ? t("imageUploading") : t("imageAdd")}
          </Button>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          onPick(e.target.files?.[0]);
          // Let the same file be picked again after a failure.
          e.target.value = "";
        }}
      />

      {error ? (
        <span className="text-destructive text-xs" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
