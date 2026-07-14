"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { uploadVoicemail } from "../_actions/upload-voicemail";

/**
 * Slice-A harness ingress: pick an audio file (record a fake voicemail on a
 * phone in Danish/English), optionally tag the caller number, upload. On
 * success we jump to the message detail so the reviewer lands on the player.
 */
export function UploadVoicemail() {
  const t = useTranslations("adminInbound");
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fromIdentity, setFromIdentity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError(t("uploadPickFirst"));
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    if (fromIdentity.trim()) fd.append("fromIdentity", fromIdentity.trim());

    startTransition(async () => {
      const res = await uploadVoicemail(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setFromIdentity("");
      if (fileRef.current) fileRef.current.value = "";
      router.push(`/admin/inbound/${res.id}`);
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="border-sky-200/70 bg-sky-50/70 dark:border-sky-900/40 dark:bg-sky-950/20 flex flex-col gap-3 rounded-md border p-4"
    >
      <div>
        <h2 className="text-sm font-semibold">{t("uploadTitle")}</h2>
        <p className="text-muted-foreground text-xs">{t("uploadHint")}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="vm-file">{t("uploadFileLabel")}</Label>
          <Input
            ref={fileRef}
            id="vm-file"
            type="file"
            accept="audio/*,video/mp4,.m4a,.mp3,.wav,.ogg,.webm"
            className="bg-background"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="vm-from">{t("uploadFromLabel")}</Label>
          <Input
            id="vm-from"
            value={fromIdentity}
            onChange={(e) => setFromIdentity(e.target.value)}
            placeholder="+45 12 34 56 78"
            className="bg-background"
          />
        </div>
      </div>
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={isPending} size="sm">
          <Upload aria-hidden />
          {isPending ? t("uploading") : t("uploadButton")}
        </Button>
      </div>
    </form>
  );
}
