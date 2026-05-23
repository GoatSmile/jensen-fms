"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LayerGroup, Map as LeafletMap } from "leaflet";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import "leaflet/dist/leaflet.css";
import "./popup-styles.css";

export type CustomerPin = {
  id: string;
  name: string;
  city: string | null;
  countryCode: string | null;
  segmentSlug: string | null;
  segmentLabel: string | null;
  bikes: number;
  saBikes: number;
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

/**
 * Customer map — Leaflet (CARTO Positron). Pins sized by √(bikes), brand
 * blue when the customer has bikes under an active service agreement,
 * grey otherwise. Initial view fit-bounds to all visible pins capped at
 * zoom 9 so a lone outlier doesn't blow up the scale.
 *
 * Leaflet touches `window` at import time, so this whole component is
 * the dynamic / client-only side of the route. The server page upstream
 * fetches the data and renders this via next/dynamic with ssr disabled.
 */
export default function CustomerMap({ pins, segments }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const [segment, setSegment] = useState<string>("all");
  const [mapReady, setMapReady] = useState(false);

  const filtered = useMemo(
    () =>
      segment === "all"
        ? pins
        : pins.filter((p) => p.segmentSlug === segment),
    [pins, segment],
  );

  const totals = useMemo(() => {
    let bikes = 0;
    let sa = 0;
    for (const p of filtered) {
      bikes += p.bikes;
      sa += p.saBikes;
    }
    return { customers: filtered.length, bikes, sa };
  }, [filtered]);

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
      for (const c of filtered) {
        const radius = Math.min(8 + Math.sqrt(c.bikes) * 1.7, 28);
        const hasSA = c.saBikes > 0;
        const marker = L.circleMarker([c.latitude, c.longitude], {
          radius,
          color: "#ffffff",
          weight: 2,
          fillColor: hasSA ? BRAND_BLUE : MUTED_GREY,
          fillOpacity: 0.88,
        });
        const saPct =
          c.bikes > 0 ? Math.round((c.saBikes / c.bikes) * 100) : 0;
        const cityLine = [c.city, c.countryCode].filter(Boolean).join(", ");
        marker.bindPopup(
          `<div class="jp-pop">
             <div class="jp-pop__name">${escapeHtml(c.name)}</div>
             ${
               cityLine || c.segmentLabel
                 ? `<div class="jp-pop__sub">${escapeHtml(cityLine)}${cityLine && c.segmentLabel ? " · " : ""}${escapeHtml(c.segmentLabel ?? "")}</div>`
                 : ""
             }
             <div class="jp-pop__row">
               <span>Bikes in service</span>
               <strong class="jp-tabular">${c.bikes}</strong>
             </div>
             <div class="jp-pop__row">
               <span>Under service agreement</span>
               <strong class="jp-tabular">${c.saBikes} <span class="jp-pop__pct">(${saPct}%)</span></strong>
             </div>
           </div>`,
          { closeButton: true, className: "jp-popup", maxWidth: 280 },
        );
        layer.addLayer(marker);
      }
      layer.addTo(map);
      layerRef.current = layer;

      // Fit to the filtered set so segment switches re-frame the map.
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
            <span className="tabular-nums">{totals.customers}</span>{" "}
            {totals.customers === 1 ? "customer" : "customers"} ·{" "}
            <span className="tabular-nums">
              {totals.bikes.toLocaleString("da-DK")}
            </span>{" "}
            bikes in service ·{" "}
            <span className="tabular-nums">
              {totals.sa.toLocaleString("da-DK")}
            </span>{" "}
            under service agreement
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={resetView}>
          Reset view
        </Button>
      </header>

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

        {/* Legend overlay — top-right. Hidden on very narrow phones; the
            same info is implied by hovering pins. */}
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
            <div className="flex items-center gap-2">
              <Dot size={14} color={BRAND_BLUE} />
              <span className="text-muted-foreground text-xs">
                Has service agreement
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Dot size={14} color={MUTED_GREY} />
              <span className="text-muted-foreground text-xs">
                No service agreement
              </span>
            </div>
          </div>
        </div>

        {pins.length === 0 ? (
          <div className="bg-background/85 absolute inset-0 z-[300] flex items-center justify-center p-6 text-center">
            <div className="flex max-w-md flex-col gap-2 rounded-lg border bg-card p-6 shadow-sm">
              <h2 className="text-sm font-semibold">
                No customers on the map yet
              </h2>
              <p className="text-muted-foreground text-sm">
                Customers appear here once their address is geocoded. Edit
                a customer with a postal address and save — the geocoder
                fires in the background.
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Dot({
  size,
  color = BRAND_BLUE,
  className,
}: {
  size: number;
  color?: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "ring-border inline-block shrink-0 rounded-full ring-1 ring-inset",
        className,
      )}
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        border: "2px solid #fff",
      }}
    />
  );
}

/**
 * Tiny escape helper for the popup HTML strings. The popup content goes
 * through Leaflet's innerHTML, so any customer name with `<` or `&` in it
 * would otherwise misrender. Cheap defence — no full sanitiser needed
 * since we control the data shape on the server.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
