"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, ImagePlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  isAcceptedImageType,
  resizeImageForUpload,
} from "@/lib/parts/image";

import { uploadBikeImage } from "../_actions/upload-image";
import { PhotoThumb, type PhotoRow } from "./photo-thumb";
import { Section } from "./section";

type Props = {
  bikeId: string;
  photos: PhotoRow[];
};

type Status =
  | { kind: "idle" }
  | { kind: "uploading"; current: number; total: number }
  | { kind: "error"; message: string };

/**
 * Bike photo gallery. Mirrors the parts pattern: client-resize to WebP
 * before upload, sequential upload with "N of M" progress, hero +
 * gallery purposes, per-thumb actions for set-hero / delete.
 */
export function PhotosSection({ bikeId, photos }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [thumbError, setThumbError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [, startUiTransition] = useTransition();

  async function uploadFiles(files: File[]) {
    if (files.length === 0) return;
    setThumbError(null);

    let i = 0;
    for (const file of files) {
      i += 1;
      setStatus({ kind: "uploading", current: i, total: files.length });

      if (!isAcceptedImageType(file)) {
        setStatus({
          kind: "error",
          message: `${file.name}: only JPEG, PNG, WebP, or GIF are accepted.`,
        });
        return;
      }

      let blob: Blob;
      try {
        const result = await resizeImageForUpload(file);
        blob = result.blob;
      } catch (err) {
        setStatus({
          kind: "error",
          message: `${file.name}: ${err instanceof Error ? err.message : "could not resize"}`,
        });
        return;
      }

      const fd = new FormData();
      fd.append("bikeId", bikeId);
      fd.append(
        "file",
        new File([blob], replaceExt(file.name, "webp"), {
          type: "image/webp",
        }),
      );

      const res = await uploadBikeImage(fd);
      if (!res.ok) {
        setStatus({ kind: "error", message: `${file.name}: ${res.error}` });
        return;
      }
    }

    setStatus({ kind: "idle" });
    if (fileInputRef.current) fileInputRef.current.value = "";
    startUiTransition(() => router.refresh());
  }

  function onFilesPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    void uploadFiles(files);
  }

  return (
    <Section
      title="Photos"
      description="Snap a bike on the workbench, before shipping, on delivery. Hero shows on the bike list and detail header."
      action={
        <Button
          size="sm"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={status.kind === "uploading"}
        >
          <ImagePlus aria-hidden />
          {status.kind === "uploading"
            ? `Uploading ${status.current} of ${status.total}…`
            : "Upload photos"}
        </Button>
      }
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="sr-only"
        onChange={onFilesPicked}
      />

      {status.kind === "error" ? (
        <p className="text-destructive mb-3 text-sm" role="alert">
          {status.message}
        </p>
      ) : null}
      {thumbError ? (
        <p className="text-destructive mb-3 text-sm" role="alert">
          {thumbError}
        </p>
      ) : null}

      {photos.length === 0 ? (
        <div className="text-muted-foreground flex h-20 items-center justify-center rounded-md border border-dashed text-sm">
          <span className="flex items-center gap-2">
            <Camera aria-hidden className="size-4" />
            No photos yet — upload one to give this bike a face.
          </span>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {photos.map((p) => (
            <PhotoThumb
              key={p.id}
              bikeId={bikeId}
              photo={p}
              onError={setThumbError}
            />
          ))}
        </div>
      )}
    </Section>
  );
}

function replaceExt(name: string, newExt: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? `${name.slice(0, dot)}.${newExt}` : `${name}.${newExt}`;
}
