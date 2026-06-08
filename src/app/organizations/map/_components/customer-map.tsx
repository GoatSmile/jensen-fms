"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LayerGroup, Map as LeafletMap } from "leaflet";

import { Button } from "@/components/ui/button";
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
const BIKE_INDIGO = "#4f46e5";

type Layers = {
  customers: boolean;
  prospects: boolean;
  departments: boolean;
  bikes: boolean;
  expiringOnly: boolean;
};

/**
 * Customer map — Leaflet (CARTO Positron). A sales/prospecting surface, not
 * just current state. Toggleable layers: customers (blue = has a service
 * agreement, grey = none), prospects (amber sales leads), departments (teal
 * org units, e.g. kommune sub-departments), and an "expiring ≤90d" filter
 * that isolates customers whose service agreement is up for renewal (red
 * ring). The segment chip rail filters within whatever layers are on.
 *
 * Leaflet touches `window` at import time, so this whole component is the
 * client-only side of the route; the server page fetches + renders it.
 */
export default function CustomerMap({ pins, segments }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const [segment, setSegment] = useState<string>("all");
  const [layers, setLayers] = useState<Layers>({
    customers: true,
    prospects: true,
    departments: true,
    bikes: true,
    expiringOnly: false,
  });
  const [mapReady, setMapReady] = useState(false);

  function toggleLayer(key: keyof Layers) {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const filtered = useMemo(() => {
    const layerOn = (p: CustomerPin) =>
      p.kind === "customer"
        ? layers.customers
        : p.kind === "prospect"
          ? layers.prospects
          : p.kind === "bike"
            ? layers.bikes
            : layers.departments;
    return pins.filter(
      (p) =>
        layerOn(p) &&
        (segment === "all" || p.segmentSlug === segment) &&
        // "expiring only" is a service-agreement filter; it doesn't apply to
        // bike pins, which would otherwise all vanish when it's on.
        (!layers.expiringOnly || p.kind === "bike" || p.expiringSoon),
    );
  }, [pins, segment, layers]);

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

  // Counts per layer across the full set (for the toggle labels).
  const layerCounts = useMemo(() => {
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
    return { customers, prospects, departments, bikes, expiring };
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
      }).setView([55, 11], 5); // Denmark-ish initial; fit-bounds replaces this.

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

  // Re-plot pins whenever the filtered set changes. Replaces the whole
  // layer instead of diffing — cheaper to read, fast enough at our scale.
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
      // Bikes drawn last so they sit on top of the customer/dept pins they
      // share a location with.
      const ordered = [...filtered].sort(
        (a, b) => (a.kind === "bike" ? 1 : 0) - (b.kind === "bike" ? 1 : 0),
      );
      for (const c of ordered) {
        const isBike = c.kind === "bike";
        const radius = isBike
          ? 5
          : Math.min(7 + Math.sqrt(c.bikes) * 1.7, 28);
        const fillColor = isBike
          ? BIKE_INDIGO
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
               <div class="jp-pop__sub">Bike${c.status ? " · " + escapeHtml(c.status.replace(/_/g, " ")) : ""}</div>
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

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-start justify-between gap-4 border-b px-4 py-3 sm:px-6">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-2xl font-semibold tracking-tight">
            Customer map
          </h1>
          <p className="text-muted-foreground text-sm">
            <span className="tabular-nums">{totals.pins}</span> pins ·{" "}
            <span className="tabular-nums">
              {totals.bikes.toLocaleString("da-DK")}
            </span>{" "}
            bikes ·{" "}
            <span className="tabular-nums">{totals.prospects}</span> prospects ·{" "}
            <span className="tabular-nums">{totals.expiring}</span> expiring
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={resetView}>
          Reset view
        </Button>
      </header>

      {/* Layer toggles — multi-select. */}
      <div className="border-b">
        <div className="flex flex-wrap gap-1.5 px-4 py-2.5 sm:px-6">
          <LayerToggle
            label="Customers"
            count={layerCounts.customers}
            color={BRAND_BLUE}
            active={layers.customers}
            onClick={() => toggleLayer("customers")}
          />
          <LayerToggle
            label="Prospects"
            count={layerCounts.prospects}
            color={PROSPECT_AMBER}
            active={layers.prospects}
            onClick={() => toggleLayer("prospects")}
          />
          <LayerToggle
            label="Departments"
            count={layerCounts.departments}
            color={UNIT_TEAL}
            active={layers.departments}
            onClick={() => toggleLayer("departments")}
          />
          <LayerToggle
            label="Bikes"
            count={layerCounts.bikes}
            color={BIKE_INDIGO}
            active={layers.bikes}
            onClick={() => toggleLayer("bikes")}
          />
          <LayerToggle
            label="Expiring ≤90d"
            count={layerCounts.expiring}
            color={EXPIRING_RED}
            active={layers.expiringOnly}
            onClick={() => toggleLayer("expiringOnly")}
          />
        </div>
      </div>

      {/* Segment chip rail. Horizontally scrollable on narrow viewports. */}
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
        <div className="bg-background absolute right-3 top-3 z-[400] hidden min-w-[200px] rounded-md border p-3 shadow-md sm:block">
          <div className="text-muted-foreground mb-2 text-[10px] font-medium uppercase tracking-wider">
            Pin scale · bikes
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
            <LegendRow color={BIKE_INDIGO} label="Bike (owner / workshop)" />
            <LegendRow
              color={BRAND_BLUE}
              ring={EXPIRING_RED}
              label="Agreement expiring ≤90d"
            />
          </div>
        </div>

        {pins.length === 0 ? (
          <div className="bg-background/85 absolute inset-0 z-[300] flex items-center justify-center p-6 text-center">
            <div className="flex max-w-md flex-col gap-2 rounded-lg border bg-card p-6 shadow-sm">
              <h2 className="text-sm font-semibold">
                No customers on the map yet
              </h2>
              <p className="text-muted-foreground text-sm">
                Customers appear here once their address is geocoded. Edit a
                customer with a postal address and save — the geocoder fires
                in the background.
              </p>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-background/85 absolute left-1/2 top-4 z-[300] -translate-x-1/2 rounded-md border bg-card px-4 py-2 text-center text-sm shadow-sm">
            No pins match the current layers / filter.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function LayerToggle({
  label,
  count,
  color,
  active,
  onClick,
}: {
  label: string;
  count: number;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-foreground/30 bg-muted text-foreground"
          : "border-input bg-background text-muted-foreground opacity-60 hover:opacity-100",
      )}
    >
      <span
        aria-hidden
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
      <span className="tabular-nums opacity-70">{count}</span>
    </button>
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
 * Tiny escape helper for the popup HTML strings. The popup content goes
 * through Leaflet's innerHTML, so any customer name with `<` or `&` in it
 * would otherwise misrender.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
