import { Context, type Effect } from "effect";

import type {
  AttachmentBadMimeError,
  AttachmentTooLargeError,
  SessionId,
  SessionNotFoundError,
} from "@memoize/wire";

export type UploadFailure =
  | AttachmentTooLargeError
  | AttachmentBadMimeError
  | SessionNotFoundError;

export interface AttachmentServiceShape {
  readonly upload: (
    sessionId: SessionId,
    bytes: Uint8Array,
    mimeType: string,
    originalName: string,
  ) => Effect.Effect<
    {
      readonly id: string;
      readonly sizeBytes: number;
      readonly mimeType: string;
      readonly ext: string;
    },
    UploadFailure
  >;
  readonly touch: (ids: ReadonlyArray<string>) => Effect.Effect<void>;
  readonly read: (
    id: string,
  ) => Effect.Effect<
    { readonly bytes: Uint8Array; readonly mimeType: string } | null
  >;
  /**
   * Resolve an attachment to its on-disk absolute path. The codex SDK's
   * `local_image` input shape requires a path, not bytes — exposing the
   * file directly avoids an extra read/write round-trip on every turn.
   * Returns `null` when the row or file is gone (same shape as `read`).
   */
  readonly readPath: (
    id: string,
  ) => Effect.Effect<
    { readonly path: string; readonly mimeType: string } | null
  >;
}

export class AttachmentService extends Context.Tag("memoize/AttachmentService")<
  AttachmentService,
  AttachmentServiceShape
>() {}
