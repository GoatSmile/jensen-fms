import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { bikeStickerUrl, qrPngDataUrl, qrSvg } from "@/lib/qr";

/**
 * Raw-image route for QR downloads.
 *
 *   GET /api/qr/<bike-id>.svg  → image/svg+xml
 *   GET /api/qr/<bike-id>.png  → image/png
 *
 * Validates the bike exists before rendering so a stale link doesn't
 * hand out QR codes for deleted rows.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bikeIdExt: string }> },
) {
  const { bikeIdExt: raw } = await params;
  const dot = raw.lastIndexOf(".");
  if (dot < 0) return new NextResponse("Bad request", { status: 400 });
  const bikeId = raw.slice(0, dot);
  const ext = raw.slice(dot + 1).toLowerCase();
  if (ext !== "svg" && ext !== "png") {
    return new NextResponse("Unsupported format", { status: 415 });
  }

  const supabase = await createClient();
  const { data: bike, error } = await supabase
    .from("bikes")
    .select("id")
    .eq("id", bikeId)
    .maybeSingle();
  if (error) {
    return new NextResponse(`Lookup failed: ${error.message}`, { status: 500 });
  }
  if (!bike) {
    return new NextResponse("Bike not found", { status: 404 });
  }

  const url = bikeStickerUrl(bike.id);

  if (ext === "svg") {
    const svg = await qrSvg(url, { width: 1024, margin: 2 });
    return new NextResponse(svg, {
      headers: {
        "content-type": "image/svg+xml",
        "cache-control": "public, max-age=3600",
      },
    });
  }

  // PNG path: qrPngDataUrl returns a data:image/png;base64,<bytes> string.
  // We strip the prefix and decode to a Uint8Array for the response body.
  const dataUrl = await qrPngDataUrl(url, { width: 1024, margin: 2 });
  const comma = dataUrl.indexOf(",");
  const bytes = Buffer.from(dataUrl.slice(comma + 1), "base64");
  return new NextResponse(bytes, {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=3600",
    },
  });
}
