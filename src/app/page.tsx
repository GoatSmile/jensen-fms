import Link from "next/link";
import { Boxes, ClipboardList } from "lucide-react";

import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const [partsCount, openPosCount] = await Promise.all([
    supabase
      .from("parts")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null),
    supabase
      .from("purchase_orders")
      .select("id", { count: "exact", head: true })
      .in("status", ["draft", "placed", "partially_received"]),
  ]);

  const cards = [
    {
      href: "/parts",
      icon: Boxes,
      title: "Parts",
      description:
        "Catalog of every component, with stock, supplier offerings, and purchase history.",
      stat: partsCount.count != null ? `${partsCount.count} active parts` : null,
    },
    {
      href: "/purchase-orders",
      icon: ClipboardList,
      title: "Purchase orders",
      description: "Receive incoming shipments and track outstanding lines.",
      stat:
        openPosCount.count != null
          ? `${openPosCount.count} open ${openPosCount.count === 1 ? "PO" : "POs"}`
          : null,
    },
  ];

  return (
    <div className="flex flex-1 flex-col gap-8 p-6 sm:p-10">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Jensen FMS</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Fleet management workspace.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:max-w-3xl">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.href}
              href={card.href}
              className="hover:border-foreground/40 flex flex-col gap-3 rounded-lg border p-5 transition-colors"
            >
              <div className="bg-muted flex size-10 items-center justify-center rounded-md">
                <Icon aria-hidden className="size-5" />
              </div>
              <div className="flex flex-col gap-1">
                <h2 className="text-base font-semibold">{card.title}</h2>
                <p className="text-muted-foreground text-sm">
                  {card.description}
                </p>
                {card.stat ? (
                  <p className="text-muted-foreground mt-2 text-xs font-medium">
                    {card.stat}
                  </p>
                ) : null}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
