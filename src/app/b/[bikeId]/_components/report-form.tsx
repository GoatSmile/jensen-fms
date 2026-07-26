"use client";

import { useRef, useState, useTransition } from "react";
import { Camera, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  isAcceptedImageType,
  resizeImageForUpload,
  toUploadFile,
} from "@/lib/parts/image";

import { submitPublicTicketReport } from "../_actions/submit-report";

type Props = {
  bikeId: string;
  frameNumber: string;
};

type Phase =
  | { kind: "idle" }
  | { kind: "submitting" }
  | {
      kind: "submitted";
      ticketNumber: string;
      photoWarning?: string;
    }
  | { kind: "error"; message: string };

/**
 * Public report form on /b/<bike-id>. The bike summary lives in the
 * server-component shell above; this is just the textarea + photo + a
 * couple of optional contact fields.
 */
export function ReportForm({ bikeId, frameNumber }: Props) {
  const [description, setDescription] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [pending, start] = useTransition();

  async function onPhotoPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isAcceptedImageType(file)) {
      setPhase({
        kind: "error",
        message: "Photo must be an image (JPEG, PNG, WebP, GIF, or HEIC).",
      });
      return;
    }
    try {
      const result = await resizeImageForUpload(file);
      const resized = toUploadFile(file.name, result);
      setPhotoFile(resized);
      setPhotoPreview(URL.createObjectURL(result.blob));
      setPhase({ kind: "idle" });
    } catch (err) {
      setPhase({
        kind: "error",
        message:
          err instanceof Error
            ? err.message
            : "Couldn't process the photo. Try another image.",
      });
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!description.trim()) {
      setPhase({ kind: "error", message: "Please describe what's wrong." });
      return;
    }
    setPhase({ kind: "submitting" });
    const fd = new FormData();
    fd.append("description", description);
    if (name.trim()) fd.append("name", name.trim());
    if (email.trim()) fd.append("email", email.trim());
    if (photoFile) fd.append("photo", photoFile);

    start(async () => {
      const result = await submitPublicTicketReport(bikeId, fd);
      if (!result.ok) {
        setPhase({ kind: "error", message: result.error });
        return;
      }
      setPhase({
        kind: "submitted",
        ticketNumber: result.ticketNumber,
        photoWarning: result.photoWarning,
      });
    });
  }

  if (phase.kind === "submitted") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border bg-good-wash p-6 text-center">
        <CheckCircle2 className="text-good size-10" aria-hidden />
        <h2 className="text-lg font-semibold">Thanks — we have your report.</h2>
        <p className="text-muted-foreground text-sm">
          Reference:{" "}
          <span className="font-mono">{phase.ticketNumber}</span>
        </p>
        <p className="text-muted-foreground text-sm">
          Jensen Production will follow up on bike{" "}
          <span className="font-mono">{frameNumber}</span>.
        </p>
        {phase.photoWarning ? (
          <p className="mt-2 rounded-md border border-money/30 bg-money-wash px-3 py-2 text-sm text-money">
            {phase.photoWarning}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="report-description">
          What&rsquo;s wrong? <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="report-description"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. The chain keeps falling off when I shift gears."
          required
          disabled={pending}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="report-photo">Photo (optional)</Label>
        <input
          ref={photoInputRef}
          id="report-photo"
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={onPhotoPicked}
          disabled={pending}
        />
        {photoPreview ? (
          <div className="flex items-start gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
            <img
              src={photoPreview}
              alt="Selected photo"
              className="size-24 rounded-md border object-cover"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setPhotoFile(null);
                setPhotoPreview(null);
                if (photoInputRef.current) photoInputRef.current.value = "";
              }}
              disabled={pending}
            >
              Remove
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={() => photoInputRef.current?.click()}
            disabled={pending}
          >
            <Camera aria-hidden /> Add a photo
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="report-name">Your name (optional)</Label>
          <Input
            id="report-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Anna Hansen"
            disabled={pending}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="report-email">Email (optional)</Label>
          <Input
            id="report-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="for follow-up"
            disabled={pending}
          />
        </div>
      </div>

      {phase.kind === "error" ? (
        <p className="text-destructive text-sm" role="alert">
          {phase.message}
        </p>
      ) : null}

      <Button type="submit" disabled={pending || !description.trim()}>
        {pending ? "Sending…" : "Send report"}
      </Button>
      <p className="text-muted-foreground text-center text-xs">
        Your message goes straight to Jensen Production. We&rsquo;ll only
        use your contact info to follow up about this bike.
      </p>
    </form>
  );
}
