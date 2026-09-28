"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";

export type SignaturePadHandle = {
  /** PNG data URL of what was drawn, or null when nothing was. */
  toDataUrl: () => string | null;
  clear: () => void;
};

/**
 * A finger (or mouse) signature on a canvas. Pointer events cover touch, pen
 * and mouse alike; `touch-action: none` stops the page scrolling while the
 * customer signs on Finn's phone. The canvas is drawn at the device's pixel
 * ratio so the stroke stays sharp, and the image comes out on white — a
 * transparent PNG prints as nothing on some viewers.
 */
export function SignaturePad({
  ref,
  onChange,
  label,
}: {
  ref?: Ref<SignaturePadHandle>;
  /** Fires with whether anything has been drawn. */
  onChange?: (hasInk: boolean) => void;
  label: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1c1c1a";
  }, []);

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    // A tap is a dot, not nothing.
    ctx.lineTo(p.x + 0.1, p.y + 0.1);
    ctx.stroke();
    if (!hasInk) {
      setHasInk(true);
      onChange?.(true);
    }
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function end() {
    drawing.current = false;
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const { width, height } = canvas.getBoundingClientRect();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    setHasInk(false);
    onChange?.(false);
  }

  useImperativeHandle(ref, () => ({
    toDataUrl: () =>
      hasInk && canvasRef.current
        ? canvasRef.current.toDataURL("image/png")
        : null,
    clear,
  }));

  return (
    <canvas
      ref={canvasRef}
      aria-label={label}
      role="img"
      className="border-rule h-48 w-full touch-none rounded-lg border bg-white"
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onPointerLeave={end}
    />
  );
}
