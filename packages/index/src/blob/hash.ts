import { blake3 } from "@noble/hashes/blake3";

/**
 * Content-addressed key for a blob. 32-byte blake3 of the raw bytes.
 *
 * blake3 picked over sha256 because we hash every file on every walk.
 * blake3 is 5-10× faster on the body sizes we see, with comparable collision
 * resistance for a content-addressed dedup store (we're not signing anything).
 *
 * Returned as Uint8Array so callers can either store the raw 32 bytes in a
 * SQLite BLOB column (the cheap path) or hex-encode for logging.
 */
export const blakeOf = (bytes: Uint8Array | string): Uint8Array =>
  blake3(typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes);

export const hexOf = (digest: Uint8Array): string =>
  Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
