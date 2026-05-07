import { Effect } from "effect";
import { create } from "zustand";

import type { AttachmentRef, SessionId } from "@forkzero/wire";

import { getRpcClient } from "../lib/rpc-client.ts";

/**
 * Per-image cap that mirrors the server-side validator. Rejecting in the
 * renderer first keeps the round-trip toast fast and avoids ever sending
 * gigabytes that would be rejected anyway.
 */
const MAX_IMAGE_BYTES = 100 * 1024 * 1024;

/**
 * The set of attachment ids the renderer is currently keeping alive. Any
 * id in this set is heartbeat by `attachments.touch` every 30 s so the
 * server's GC sweep doesn't reap a blob that's still referenced by a draft
 * composer chip or a queued message.
 */
type AttachmentsState = {
  readonly activeIds: ReadonlySet<string>;
  readonly registerActive: (id: string) => void;
  readonly forgetActive: (id: string) => void;
  readonly uploadOne: (
    sessionId: SessionId,
    file: File,
  ) => Promise<AttachmentRef>;
};

const fileToBytes = (file: File): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const buf = reader.result;
      if (buf instanceof ArrayBuffer) resolve(new Uint8Array(buf));
      else reject(new Error("FileReader produced non-ArrayBuffer result"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("FileReader error"));
    reader.readAsArrayBuffer(file);
  });

export const useAttachmentsStore = create<AttachmentsState>((set, get) => ({
  activeIds: new Set(),
  registerActive: (id) =>
    set((s) => {
      const next = new Set(s.activeIds);
      next.add(id);
      return { activeIds: next };
    }),
  forgetActive: (id) =>
    set((s) => {
      if (!s.activeIds.has(id)) return s;
      const next = new Set(s.activeIds);
      next.delete(id);
      return { activeIds: next };
    }),
  uploadOne: async (sessionId, file) => {
    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error(`Image too large (max 100 MB)`);
    }
    const bytes = await fileToBytes(file);
    const client = await getRpcClient();
    const result = await Effect.runPromise(
      client.attachments.upload({
        sessionId,
        bytes,
        mimeType: file.type || "application/octet-stream",
        originalName: file.name || "image",
      }),
    );
    const ref: AttachmentRef = {
      id: result.id,
      mimeType: result.mimeType,
      originalName: file.name || "image",
    };
    get().registerActive(result.id);
    return ref;
  },
}));

/**
 * Heartbeat: ping `attachments.touch` every 30 s with the current active
 * set. Boot once at app start; tears down only when the renderer unloads.
 * The interval is half the server's 90 s GC TTL so a single missed tick
 * still keeps blobs alive.
 */
export const startAttachmentsHeartbeat = (): (() => void) => {
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    const ids = Array.from(useAttachmentsStore.getState().activeIds);
    if (ids.length === 0) return;
    try {
      const client = await getRpcClient();
      await Effect.runPromise(client.attachments.touch({ ids }));
    } catch {
      // Heartbeat is best-effort; a dropped tick just means the GC may run
      // sooner. The chip will swap to a missing-attachment placeholder if
      // the blob actually disappears.
    }
  };
  const handle = window.setInterval(tick, 30_000);
  return () => {
    stopped = true;
    window.clearInterval(handle);
  };
};
