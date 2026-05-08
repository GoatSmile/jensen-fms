"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, Star, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  deletePartImage,
  setHeroImage,
} from "../_actions/manage-image";

export type PhotoRow = {
  id: string;
  fileUrl: string;
  fileName: string;
  purpose: string;
};

export function PhotoThumb({
  partId,
  photo,
  onError,
}: {
  partId: string;
  photo: PhotoRow;
  onError: (msg: string | null) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isHero = photo.purpose === "hero";

  function runSetHero() {
    onError(null);
    start(async () => {
      const r = await setHeroImage(partId, photo.id);
      if (!r.ok) onError(r.error);
      else router.refresh();
    });
  }

  function runDelete() {
    onError(null);
    start(async () => {
      const r = await deletePartImage(partId, photo.id);
      if (!r.ok) {
        onError(r.error);
        setConfirmDelete(false);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="group relative overflow-hidden rounded-md border bg-muted/30">
      {/* eslint-disable-next-line @next/next/no-img-element -- Catalog images
          are already client-resized to 1600px WebP; next/image's optimization
          adds little for small thumbnails and would require remotePatterns. */}
      <img
        src={photo.fileUrl}
        alt={photo.fileName}
        loading="lazy"
        className="aspect-square h-full w-full object-cover"
      />
      {isHero ? (
        <Badge
          variant="default"
          className="absolute top-1.5 left-1.5 gap-1 bg-amber-500/90 text-white"
        >
          <Star className="size-3 fill-current" /> Hero
        </Badge>
      ) : null}
      <div className="absolute top-1 right-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon-sm"
              variant="secondary"
              className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
              aria-label="Photo actions"
            >
              <MoreVertical aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              disabled={isHero || pending}
              onSelect={(e) => {
                e.preventDefault();
                runSetHero();
              }}
            >
              <Star aria-hidden /> Set as hero
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={pending}
              variant="destructive"
              onSelect={(e) => {
                e.preventDefault();
                if (confirmDelete) {
                  runDelete();
                } else {
                  setConfirmDelete(true);
                }
              }}
            >
              <Trash2 aria-hidden />{" "}
              {confirmDelete ? "Click again to confirm" : "Delete"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
