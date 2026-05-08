/**
 * Client-side image helpers for the Parts feature.
 *
 * `resizeImageForUpload` decodes the file via the browser's Image API,
 * downscales it on a 2D canvas, and re-encodes it as WebP. Three side-effects
 * worth knowing about:
 *   - EXIF (incl. GPS) is dropped automatically — re-encoding through canvas
 *     does not carry it forward.
 *   - The output is roughly an order of magnitude smaller than a phone-shot
 *     JPEG, which keeps server-action FormData well under the default body
 *     limit and saves bandwidth on flaky workshop wifi.
 *   - Animated GIFs lose their animation. We accept this for v1.
 */

export const ACCEPTED_IMAGE_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const RESIZE_MAX_EDGE = 1600;
export const RESIZE_QUALITY = 0.85;

export function isAcceptedImageType(file: File): boolean {
  return (ACCEPTED_IMAGE_MIME as readonly string[]).includes(file.type);
}

export async function resizeImageForUpload(
  file: File,
  maxEdge = RESIZE_MAX_EDGE,
  quality = RESIZE_QUALITY,
): Promise<{ blob: Blob; width: number; height: number }> {
  const objectUrl = URL.createObjectURL(file);
  let img: HTMLImageElement;
  try {
    img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () =>
        reject(new Error("Could not decode image — is the file corrupt?"));
      el.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }

  const longest = Math.max(img.width, img.height);
  const scale = longest > maxEdge ? maxEdge / longest : 1;
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not create a 2D canvas for resizing.");
  }
  ctx.drawImage(img, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", quality),
  );
  if (!blob) {
    throw new Error("Could not encode the resized image as WebP.");
  }
  return { blob, width, height };
}
