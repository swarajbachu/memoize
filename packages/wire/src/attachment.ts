import { Rpc } from "@effect/rpc";
import { Schema } from "effect";

import { SessionId, SessionNotFoundError } from "./session.ts";

export class AttachmentTooLargeError extends Schema.TaggedError<AttachmentTooLargeError>()(
  "AttachmentTooLargeError",
  {
    sessionId: SessionId,
    sizeBytes: Schema.Number,
    limit: Schema.Number,
  },
) {}

export class AttachmentBadMimeError extends Schema.TaggedError<AttachmentBadMimeError>()(
  "AttachmentBadMimeError",
  {
    sessionId: SessionId,
    mimeType: Schema.String,
  },
) {}

/**
 * Upload an image attachment for a session. Bytes land under the desktop
 * app's userData directory; the returned id is what the renderer stores on
 * `ComposerInput.attachments` and renders via `forkzero://attachments/<id>`.
 */
export const AttachmentUploadRpc = Rpc.make("attachments.upload", {
  payload: Schema.Struct({
    sessionId: SessionId,
    bytes: Schema.Uint8ArrayFromBase64,
    mimeType: Schema.String,
    originalName: Schema.String,
  }),
  success: Schema.Struct({
    id: Schema.String,
    sizeBytes: Schema.Number,
    mimeType: Schema.String,
    ext: Schema.String,
  }),
  error: Schema.Union(
    AttachmentTooLargeError,
    AttachmentBadMimeError,
    SessionNotFoundError,
  ),
});

/**
 * Heartbeat call: keep these attachment ids alive on the server so the GC
 * sweep does not reap blobs that are still referenced by a draft composer
 * input or a queued message. Renderer calls every 30 s with the current set.
 */
export const AttachmentTouchRpc = Rpc.make("attachments.touch", {
  payload: Schema.Struct({ ids: Schema.Array(Schema.String) }),
  success: Schema.Void,
});
