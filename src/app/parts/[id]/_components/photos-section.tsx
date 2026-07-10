"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, ImagePlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  IMAGE_TYPE_ERROR,
  isAcceptedImageType,
  resizeImageForUpload,
  toUploadFile,
} from "@/lib/parts/image";

import { uploadPartImage } from "../_actions/upload-image";
import { PhotoThumb, type PhotoRow } from "./photo-thumb";
import { EmptyRow, Section } from "./section";

type Props = {
  partId: string;
  photos: PhotoRow[];
};

type Status =
  | { kind: "idle" }
  | { kind: "uploading"; current: number; total: number }
  | { kind: "error"; message: string };

export function PhotosSection({ partId, photos }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  // Surface mid-flight errors from PhotoThumb actions in the same banner area.
  const [thumbError, setThumbError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [, startUiTransition] = useTransition();

  async function uploadFiles(files: File[]) {
    if (files.length === 0) return;
    setThumbError(null);

    // Sequential upload so the user sees clear "n of N" progress and so a
    // failure halfway through doesn't leave half the batch hanging.
    let i = 0;
    for (const file of files) {
      i += 1;
      setStatus({ kind: "uploading", current: i, total: files.length });

      if (!isAcceptedImageType(file)) {
        setStatus({
          kind: "error",
          message: `${file.name}: ${IMAGE_TYPE_ERROR}`,
        });
        return;
      }

      let upload: File;
      try {
        const result = await resizeImageForUpload(file);
        // Keep the original filename (new extension) for human-readable
        // file_name on the attachment row.
        upload = toUploadFile(file.name, result);
      } catch (err) {
        setStatus({
          kind: "error",
          message: `${file.name}: ${err instanceof Error ? err.message : "could not resize"}`,
        });
        return;
      }

      const fd = new FormData();
      fd.append("partId", partId);
      fd.append("file", upload);

      const res = await uploadPartImage(fd);
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
      description="Drop on the workbench, point at it with your phone, hit upload. Hero shows in the header and on the parts list."
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
      {/* No `capture` attr: it forces the camera on mobile and disables the
          photo library + multi-select. Without it, iOS/Android offer
          "Take photo / Choose from library" — camera stays one tap away. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
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
        <EmptyRow>
          <span className="flex items-center gap-2">
            <Camera aria-hidden className="size-4" />
            No photos yet — upload one to give this part a face.
          </span>
        </EmptyRow>
      ) : (
        <div className="grid gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {photos.map((p) => (
            <PhotoThumb
              key={p.id}
              partId={partId}
              photo={p}
              onError={setThumbError}
            />
          ))}
        </div>
      )}
    </Section>
  );
}
