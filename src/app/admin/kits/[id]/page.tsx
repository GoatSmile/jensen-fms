import Link from "next/link";
import { notFound } from "next/navigation";
import { Printer } from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/section";
import { createClient } from "@/lib/supabase/server";
import { kitCode, stickerColor } from "@/lib/kits/colors";

import { ArchiveKitButton } from "../_components/archive-kit-button";
import { KitForm, type KitFormValues } from "../_components/kit-form";

export const dynamic = "force-dynamic";

export default async function KitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [kitRes, membersRes] = await Promise.all([
    supabase
      .from("kits")
      .select("id, sticker_color, kit_number, description, is_active")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("part_kits")
      .select("part:parts!part_id(id, internal_sku, name_en, deleted_at)")
      .eq("kit_id", id),
  ]);

  if (kitRes.error) throw new Error(`Failed to load kit: ${kitRes.error.message}`);
  const kit = kitRes.data;
  if (!kit) notFound();

  const parts = (membersRes.data ?? [])
    .map((m) => (Array.isArray(m.part) ? m.part[0] : m.part))
    .filter((p): p is NonNullable<typeof p> => p != null && p.deleted_at == null)
    .sort((a, b) => a.internal_sku.localeCompare(b.internal_sku));

  const code = kitCode(kit.sticker_color, kit.kit_number);
  const colour = stickerColor(kit.sticker_color);
  const initial: KitFormValues = {
    sticker_color: kit.sticker_color,
    kit_number: kit.kit_number == null ? "" : String(kit.kit_number),
    description: kit.description ?? "",
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Dashboard</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/admin">Admin</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/admin/kits">Kits</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{code}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="inline-block size-8 rounded-md border border-black/10"
            style={{ backgroundColor: colour.hex }}
          />
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold">{code}</h1>
              <Badge variant={kit.is_active ? "success" : "secondary"}>
                {kit.is_active ? "Active" : "Archived"}
              </Badge>
            </div>
            {kit.description ? (
              <p className="text-muted-foreground text-sm">{kit.description}</p>
            ) : null}
          </div>
        </div>
        <Button asChild variant="outline">
          <Link href={`/admin/kits/${id}/stickers`}>
            <Printer aria-hidden /> Sticker sheet
          </Link>
        </Button>
      </div>

      <Section
        title="Edit kit"
        description="Changing colour or number changes the sticker code — reprint labels afterwards."
      >
        <KitForm mode="edit" kitId={id} initial={initial} />
      </Section>

      <Section
        title={`Labelled parts (${parts.length})`}
        description="Parts carrying this sticker. Tag and untag from each part's detail page, or in bulk from a bike template's BOM."
      >
        {parts.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No parts labelled yet.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {parts.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/parts/${p.id}`}
                  className="hover:bg-muted flex flex-col rounded-md border px-3 py-2"
                >
                  <span className="text-sm font-medium">{p.name_en}</span>
                  <span className="text-muted-foreground font-mono text-xs">
                    {p.internal_sku}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <ArchiveKitButton
        id={id}
        isActive={kit.is_active}
        partCount={parts.length}
      />
    </div>
  );
}
