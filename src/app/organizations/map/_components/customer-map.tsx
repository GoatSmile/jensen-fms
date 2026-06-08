"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LayerGroup, Map as LeafletMap } from "leaflet";

import { Button } from "@/components/ui/button";
import { bikeStatusLabel } from "@/lib/bikes/status";
import { countryName } from "@/lib/countries";
import { cn } from "@/lib/utils";

import "leaflet/dist/leaflet.css";
import "./popup-styles.css";

export type PinKind = "customer" | "prospect" | "unit" | "bike";

export type CustomerPin = {
  id: string;
  kind: PinKind;
  name: string;
  parentName: string | null;
  status: string | null;
  city: string | null;
  countryCode: string | null;
  segmentSlug: string | null;
  segmentLabel: string | null;
  bikes: number;
  saBikes: number;
  expiringSoon: boolean;
  latitude: number;
  longitude: number;
};

type FilterChip = { id: string; label: string };

type Props = {
  pins: CustomerPin[];
  segments: FilterChip[];
};

const FIT_OPTIONS = { padding: [40, 40] as [number, number], maxZoom: 9 };
const BRAND_BLUE = "#1e4a7a";
const MUTED_GREY = "#737373";
const PROSPECT_AMBER = "#d97706";
const UNIT_TEAL = "#0d9488";
const EXPIRING_RED = "#dc2626";
const BIKE_NEUTRAL = "#4f46e5";

// Map-only pin colours per bike status. Labels come from the canonical
// bikeStatusLabel (src/lib/bikes/status) so the map matches the rest of the
// app. Green = working, red = needs repair, amber = build pipeline,
// blue = ready/with customer, grey = not yet real.
const BIKE_STATUS_COLOR: Record<string, string> = {
  in_service: "#16a34a",
  assigned: "#0284c7",
  in_stock: "#0ea5e9",
  in_maintenance: "#dc2626",
  building: "#d97706",
  planning: "#94a3b8",
};
const BIKE_LEGEND_STATUSES = [
  "in_service",
  "assigned",
  "in_stock",
  "in_maintenance",
  "building",
  "planning",
] as const;
const bikeColor = (status: string | null) =>
  (status && BIKE_STATUS_COLOR[status]) || BIKE_NEUTRAL;

type View =
  | "all"
  | "customers"
  | "prospects"
  | "departments"
  | "bikes"
  | "expiring";

/**
 * Map — Leaflet (CARTO Positron). A sales/prospecting + fleet surface.
 * Single-select view chips isolate one thing in a click: All, Customers
 * (blue = has a service agreement, grey = none), Prospects (amber leads),
 * Departments (teal org units), Bikes (coloured by status), or Expiring
 * (customers whose agreement renews within 90 days, red ring). The segment
 * chip rail filters within the chosen view.
 */
export default function CustomerMap({ pins, segments }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const [segment, setSegment] = useState<string>("all");
  const [view, setView] = useState<View>("all");
  const [mapReady, setMapReady] = useState(false);

  const filtered = useMemo(() => {
    const matchesView = (p: CustomerPin) => {
      switch (view) {
        case "customers":
          return p.kind === "customer";
        case "prospects":
          return p.kind === "prospect";
        case "departments":
          return p.kind === "unit";
        case "bikes":
          return p.kind === "bike";
        case "expiring":
          return p.expiringSoon;
        default:
          return true;
      }
    };
    return pins.filter(
      (p) => matchesView(p) && (segment === "all" || p.segmentSlug === segment),
    );
  }, [pins, segment, view]);

  const totals = useMemo(() => {
    let bikes = 0;
    let prospects = 0;
    let expiring = 0;
    for (const p of filtered) {
      if (p.kind === "bike") bikes += 1;
      if (p.kind === "prospect") prospects += 1;
      if (p.expiringSoon) expiring += 1;
    }
    return { pins: filtered.length, bikes, prospects, expiring };
  }, [filtered]);

  // Counts per view across the full set (for the chip labels).
  const viewCounts = useMemo(() => {
    let customers = 0;
    let prospects = 0;
    let departments = 0;
    let bikes = 0;
    let expiring = 0;
    for (const p of pins) {
      if (p.kind === "customer") customers += 1;
      else if (p.kind === "prospect") prospects += 1;
      else if (p.kind === "bike") bikes += 1;
      else departments += 1;
      if (p.expiringSoon) expiring += 1;
    }
    return { all: pins.length, customers, prospects, departments, bikes, expiring };
  }, [pins]);

  // Mount the map once. Tile layer + zoom controls, nothing else.
  useEffect(() => {
    let cancelled = false;
    let createdMap: LeafletMap | null = null;
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, {
        zoomControl: true,
        attributionControl: true,
        worldCopyJump: true,
      }).setView([55, 11], 5);

      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
        {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &middot; &copy; CARTO',
          subdomains: "abcd",
          maxZoom: 19,
        },
      ).addTo(map);

      mapRef.current = map;
      createdMap = map;
      setMapReady(true);
    })();
    return () => {
      cancelled = true;
      createdMap?.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // Re-plot pins whenever the filtered set changes.
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    if (!map) return;

    (async () => {
      const L = await import("leaflet");
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
      if (filtered.length === 0) return;

      const layer = L.layerGroup();
      // Bikes drawn last so they sit on top of the pins they share a spot with.
      const ordered = [...filtered].sort(
        (a, b) => (a.kind === "bike" ? 1 : 0) - (b.kind === "bike" ? 1 : 0),
      );
      for (const c of ordered) {
        const isBike = c.kind === "bike";
        const radius = isBike
          ? 5
          : Math.min(7 + Math.sqrt(c.bikes) * 1.7, 28);
        const fillColor = isBike
          ? bikeColor(c.status)
          : c.kind === "prospect"
            ? PROSPECT_AMBER
            : c.kind === "unit"
              ? UNIT_TEAL
              : c.saBikes > 0
                ? BRAND_BLUE
                : MUTED_GREY;
        const marker = L.circleMarker([c.latitude, c.longitude], {
          radius,
          color: c.expiringSoon ? EXPIRING_RED : "#ffffff",
          weight: c.expiringSoon ? 3 : isBike ? 1.5 : 2,
          fillColor,
          fillOpacity: isBike ? 0.95 : 0.88,
        });

        if (isBike) {
          marker.bindPopup(
            `<div class="jp-pop">
               <div class="jp-pop__name">${escapeHtml(c.name)}</div>
               <div class="jp-pop__sub">Bike · ${escapeHtml(bikeStatusLabel(c.status))}</div>
               <div class="jp-pop__row"><span>Location</span><strong>${escapeHtml(c.parentName ?? "—")}</strong></div>
             </div>`,
            { closeButton: true, className: "jp-popup", maxWidth: 280 },
          );
          layer.addLayer(marker);
          continue;
        }

        const saPct =
          c.bikes > 0 ? Math.round((c.saBikes / c.bikes) * 100) : 0;
        const cityLine = [
          c.city,
          c.countryCode ? countryName(c.countryCode) : null,
        ]
          .filter(Boolean)
          .join(", ");
        const kindLabel =
          c.kind === "prospect"
            ? "Prospect"
            : c.kind === "unit"
              ? `Department · ${c.parentName ?? "—"}`
              : null;
        const subParts = [kindLabel, cityLine, c.segmentLabel].filter(Boolean);
        marker.bindPopup(
          `<div class="jp-pop">
             <div class="jp-pop__name">${escapeHtml(c.name)}</div>
             ${
               subParts.length
                 ? `<div class="jp-pop__sub">${subParts.map((s) => escapeHtml(String(s))).join(" · ")}</div>`
                 : ""
             }
             ${
               c.kind === "unit"
                 ? `<div class="jp-pop__row"><span>Bikes in service</span><strong class="jp-tabular">${c.bikes}</strong></div>`
                 : `<div class="jp-pop__row">
                      <span>Bikes in service</span>
                      <strong class="jp-tabular">${c.bikes}</strong>
                    </div>
                    <div class="jp-pop__row">
                      <span>Under service agreement</span>
                      <strong class="jp-tabular">${c.saBikes} <span class="jp-pop__pct">(${saPct}%)</span></strong>
                    </div>`
             }
             ${
               c.expiringSoon
                 ? `<div class="jp-pop__row"><span style="color:${EXPIRING_RED}">Agreement expiring ≤90 days</span></div>`
                 : ""
             }
           </div>`,
          { closeButton: true, className: "jp-popup", maxWidth: 280 },
        );
        layer.addLayer(marker);
      }
      layer.addTo(map);
      layerRef.current = layer;

      const fg = L.featureGroup(layer.getLayers());
      const bounds = fg.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, FIT_OPTIONS);
      }
    })();
  }, [filtered, mapReady]);

  async function resetView() {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    const L = await import("leaflet");
    const fg = L.featureGroup(layer.getLayers());
    const bounds = fg.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, FIT_OPTIONS);
    }
  }

  const viewChips: { id: View; label: string; count: number; color?: string }[] =
    [
      { id: "all", label: "All", count: viewCounts.all },
      { id: "customers", label: "Customers", count: viewCounts.customers, color: BRAND_BLUE },
      { id: "prospects", label: "Prospects", count: viewCounts.prospects, color: PROSPECT_AMBER },
      { id: "departments", label: "Departments", count: viewCounts.departments, color: UNIT_TEAL },
      { id: "bikes", label: "Bikes", count: viewCounts.bikes, color: BIKE_NEUTRAL },
      { id: "expiring", label: "Expiring ≤90d", count: viewCounts.expiring, color: EXPIRING_RED },
    ];

  const showBikeLegend = view === "all" || view === "bikes";

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-start justify-between gap-4 border-b px-4 py-3 sm:px-6">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-2xl font-semibold tracking-tight">Map</h1>
          <p className="text-muted-foreground text-sm">
            <span className="tabular-nums">{totals.pins}</span> pins ·{" "}
            <span className="tabular-nums">{totals.bikes}</span> bikes ·{" "}
            <span className="tabular-nums">{totals.prospects}</span> prospects ·{" "}
            <span className="tabular-nums">{totals.expiring}</span> expiring
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={resetView}>
          Reset view
        </Button>
      </header>

      {/* View chips — single-select: one click isolates a layer. */}
      <div className="border-b">
        <div className="flex flex-wrap gap-1.5 px-4 py-2.5 sm:px-6">
          {viewChips.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setView(c.id)}
              aria-pressed={view === c.id}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                view === c.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-background text-foreground hover:bg-muted",
              )}
            >
              {c.color ? (
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-2.5 rounded-full ring-1 ring-white/40"
                  style={{ backgroundColor: c.color }}
                />
              ) : null}
              {c.label}
              <span className="tabular-nums opacity-70">{c.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Segment chip rail. */}
      <div className="border-b">
        <div className="flex gap-1.5 overflow-x-auto px-4 py-2.5 sm:px-6">
          {segments.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSegment(s.id)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                segment === s.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-background text-foreground hover:bg-muted",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <div ref={containerRef} className="h-full w-full" />

        {/* Legend overlay — top-right. */}
        <div className="bg-background absolute right-3 top-3 z-[400] hidden max-h-[calc(100%-1.5rem)] min-w-[200px] overflow-auto rounded-md border p-3 shadow-md sm:block">
          {view !== "bikes" ? (
            <>
              <div className="text-muted-foreground mb-2 text-[10px] font-medium uppercase tracking-wider">
                Pin scale · bikes in service
              </div>
              <div className="flex items-center gap-2">
                <Dot size={12} />
                <span className="text-muted-foreground text-xs">≤ 10</span>
                <Dot size={18} className="ml-3" />
                <span className="text-muted-foreground text-xs">50</span>
                <Dot size={28} className="ml-3" />
                <span className="text-muted-foreground text-xs">300+</span>
              </div>
              <div className="mt-3 flex flex-col gap-1.5">
                <LegendRow color={BRAND_BLUE} label="Customer · has agreement" />
                <LegendRow color={MUTED_GREY} label="Customer · no agreement" />
                <LegendRow color={PROSPECT_AMBER} label="Prospect (sales lead)" />
                <LegendRow color={UNIT_TEAL} label="Department / unit" />
                <LegendRow
                  color={BRAND_BLUE}
                  ring={EXPIRING_RED}
                  label="Agreement expiring ≤90d"
                />
              </div>
            </>
          ) : null}
          {showBikeLegend ? (
            <div className={cn("flex flex-col gap-1.5", view !== "bikes" && "mt-3 border-t pt-3")}>
              <div className="text-muted-foreground text-[10px] font-medium uppercase tracking-wider">
                Bikes by status
              </div>
              {BIKE_LEGEND_STATUSES.map((s) => (
                <LegendRow key={s} color={BIKE_STATUS_COLOR[s]} label={bikeStatusLabel(s)} />
              ))}
            </div>
          ) : null}
        </div>

        {pins.length === 0 ? (
          <div className="bg-background/85 absolute inset-0 z-[300] flex items-center justify-center p-6 text-center">
            <div className="flex max-w-md flex-col gap-2 rounded-lg border bg-card p-6 shadow-sm">
              <h2 className="text-sm font-semibold">Nothing on the map yet</h2>
              <p className="text-muted-foreground text-sm">
                Customers, prospects, and bikes appear here once they have a
                location. Add a postal address (or assign a bike) and it shows
                up.
              </p>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-background/85 absolute left-1/2 top-4 z-[300] -translate-x-1/2 rounded-md border bg-card px-4 py-2 text-center text-sm shadow-sm">
            No pins match the current view / segment.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function LegendRow({
  color,
  ring,
  label,
}: {
  color: string;
  ring?: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Dot size={14} color={color} ring={ring} />
      <span className="text-muted-foreground text-xs">{label}</span>
    </div>
  );
}

function Dot({
  size,
  color = BRAND_BLUE,
  ring,
  className,
}: {
  size: number;
  color?: string;
  ring?: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("inline-block shrink-0 rounded-full", className)}
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        border: `2px solid ${ring ?? "#fff"}`,
      }}
    />
  );
}

/**
 * Escapes popup HTML strings — popup content goes through Leaflet's innerHTML.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
