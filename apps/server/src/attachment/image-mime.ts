/**
 * MIME → on-disk extension. Anything outside the supported set is rejected
 * upstream by the upload handler, so the fallback is mainly defensive — it
 * keeps the disk layout consistent if a future MIME slips through.
 */
const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

export const SUPPORTED_IMAGE_MIMES: ReadonlySet<string> = new Set(
  Object.keys(EXT_BY_MIME),
);

export const extForMime = (mimeType: string): string =>
  EXT_BY_MIME[mimeType.toLowerCase()] ?? "bin";

export const isImageMime = (mimeType: string): boolean =>
  mimeType.toLowerCase().startsWith("image/");
