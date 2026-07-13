"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { nullableString as nullable } from "@/lib/forms";
import { KIT_STICKER_COLORS } from "@/lib/kits/colors";
import { createClient } from "@/lib/supabase/server";

export type KitResult =
  | { ok: true; id: string }
  | { ok: false; error: string; field?: string };

function parseKit(
  fd: FormData,
  t: Awaited<ReturnType<typeof getTranslations>>,
):
  | {
      ok: true;
      values: {
        sticker_color: string;
        kit_number: number | null;
        description: string | null;
      };
    }
  | { ok: false; error: string; field?: string } {
  const sticker_color = nullable(fd.get("sticker_color"));
  if (
    !sticker_color ||
    !KIT_STICKER_COLORS.some((c) => c.slug === sticker_color)
  ) {
    return { ok: false, error: t("adminKitPickColor"), field: "sticker_color" };
  }

  // Number is optional — blank means a bare-colour code ("Red"). When
  // given it must be a positive whole number.
  const numberRaw = nullable(fd.get("kit_number"));
  let kit_number: number | null = null;
  if (numberRaw) {
    const n = Number(numberRaw);
    if (!Number.isInteger(n) || n <= 0) {
      return {
        ok: false,
        error: t("adminKitNumberPositive"),
        field: "kit_number",
      };
    }
    kit_number = n;
  }

  return {
    ok: true,
    values: {
      sticker_color,
      kit_number,
      description: nullable(fd.get("description")),
    },
  };
}

function revalidateKitSurfaces() {
  revalidatePath("/admin/kits");
  revalidatePath("/admin");
  revalidatePath("/parts");
}

export async function createKit(fd: FormData): Promise<KitResult> {
  const t = await getTranslations("errors");
  const parsed = parseKit(fd, t);
  if (!parsed.ok) return parsed;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("kits")
    .insert(parsed.values)
    .select("id")
    .single();
  if (error || !data) {
    const msg = error?.message ?? t("unknownError");
    return {
      ok: false,
      error: msg.includes("duplicate")
        ? t("adminKitCodeExists")
        : t("adminKitCouldNotCreate", { detail: msg }),
    };
  }
  revalidateKitSurfaces();
  return { ok: true, id: data.id };
}

export async function updateKit(id: string, fd: FormData): Promise<KitResult> {
  const t = await getTranslations("errors");
  if (!id) return { ok: false, error: t("adminMissingKitId") };
  const parsed = parseKit(fd, t);
  if (!parsed.ok) return parsed;

  const supabase = await createClient();
  const { error } = await supabase
    .from("kits")
    .update({ ...parsed.values, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    return {
      ok: false,
      error: error.message.includes("duplicate")
        ? t("adminKitCodeExists")
        : t("couldNotSave", { detail: error.message }),
    };
  }
  revalidateKitSurfaces();
  revalidatePath(`/admin/kits/${id}`);
  return { ok: true, id };
}

export async function setKitActive(
  id: string,
  isActive: boolean,
): Promise<KitResult> {
  const t = await getTranslations("errors");
  if (!id) return { ok: false, error: t("adminMissingKitId") };
  const supabase = await createClient();
  const { error } = await supabase
    .from("kits")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: t("couldNotUpdate", { detail: error.message }) };
  revalidateKitSurfaces();
  revalidatePath(`/admin/kits/${id}`);
  return { ok: true, id };
}
