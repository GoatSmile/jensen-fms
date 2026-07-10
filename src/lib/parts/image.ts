/**
 * Client-side image helpers for the Parts feature.
 *
 * `resizeImageForUpload` decodes the file via the browser's Image API,
 * downscales it on a 2D canvas, and re-encodes it as WebP (JPEG on engines
 * that can't encode WebP — older Safari). Three side-effects worth knowing
 * about:
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
  // iPhone camera-roll originals. iOS usually transcodes to JPEG when
  // picking through <input type=file>, but files picked via the Files app
  // arrive as HEIC — iOS Safari can decode them in the canvas step, and the
  // output is webp/jpeg anyway, so the server never sees HEIC bytes.
  "image/heic",
  "image/heif",
] as const;

export const IMAGE_TYPE_ERROR =
  "only photos are accepted (JPEG, PNG, WebP, GIF, or HEIC).";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const RESIZE_MAX_EDGE = 1600;
export const RESIZE_QUALITY = 0.85;

export function isAcceptedImageType(file: File): boolean {
  // Empty type happens for some Files-app picks — let the decoder decide;
  // it throws a clear error for anything that isn't actually an image.
  if (!file.type) return true;
  return (ACCEPTED_IMAGE_MIME as readonly string[]).includes(file.type);
}

type ResizedImage = {
  blob: Blob;
  mime: "image/webp" | "image/jpeg";
  ext: "webp" | "jpg";
  width: number;
  height: number;
};

/** The resized image as an upload-ready File (correct name/mime for the
 * encoding that actually happened — see the Safari note in resize). */
export function toUploadFile(originalName: string, r: ResizedImage): File {
  return new File([r.blob], replaceExt(originalName || `photo.${r.ext}`, r.ext), {
    type: r.mime,
  });
}

function replaceExt(name: string, newExt: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? `${name.slice(0, dot)}.${newExt}` : `${name}.${newExt}`;
}

function toBlobAsync(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function resizeImageForUpload(
  file: File,
  maxEdge = RESIZE_MAX_EDGE,
  quality = RESIZE_QUALITY,
): Promise<ResizedImage> {
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

  // Ask for WebP, but VERIFY we got it: Safari before 17 silently ignores
  // the webp request and hands back PNG (~10× heavier for photos) while the
  // caller would still label the file .webp. Fall back to JPEG, which every
  // engine encodes at a comparable size.
  let blob = await toBlobAsync(canvas, "image/webp", quality);
  if (blob && blob.type === "image/webp") {
    return { blob, mime: "image/webp", ext: "webp", width, height };
  }
  blob = await toBlobAsync(canvas, "image/jpeg", quality);
  if (!blob || blob.type !== "image/jpeg") {
    throw new Error("Could not encode the resized image.");
  }
  return { blob, mime: "image/jpeg", ext: "jpg", width, height };
}
