import Link from "next/link";
import {
  Bike,
  BookOpen,
  Boxes,
  ClipboardList,
  Hammer,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { OPEN_MO_STATUSES } from "@/lib/mo/status";

export default async function Home() {
  const supabase = await createClient();
  const [partsCount, openPosCount, bikeModelsCount, bikesCount, openMOsCount] =
    await Promise.all([
      supabase
        .from("parts")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null),
      supabase
        .from("purchase_orders")
        .select("id", { count: "exact", head: true })
        .in("status", ["draft", "placed", "partially_received"]),
      supabase
        .from("bike_models")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null),
      supabase
        .from("bikes")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .not("status", "in", "(retired,lost_or_stolen)"),
      supabase
        .from("manufacturing_orders")
        .select("id", { count: "exact", head: true })
        .in("status", OPEN_MO_STATUSES),
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
    {
      href: "/bike-models",
      icon: BookOpen,
      title: "Bike catalog",
      description:
        "Bike models, variants, and templates — the recipes that drive the build workbench.",
      stat:
        bikeModelsCount.count != null
          ? `${bikeModelsCount.count} active model${bikeModelsCount.count === 1 ? "" : "s"}`
          : null,
    },
    {
      href: "/bikes",
      icon: Bike,
      title: "Bikes",
      description:
        "Every physical bike — frame numbers, identifiers, parts installed, and lifecycle state log.",
      stat:
        bikesCount.count != null
          ? `${bikesCount.count} active bike${bikesCount.count === 1 ? "" : "s"}`
          : null,
    },
    {
      href: "/manufacturing-orders",
      icon: Hammer,
      title: "Manufacturing orders",
      description:
        "Production runs against a template. Tracks parts vs stock, attaches bikes, consumes inventory on completion.",
      stat:
        openMOsCount.count != null
          ? `${openMOsCount.count} open MO${openMOsCount.count === 1 ? "" : "s"}`
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
