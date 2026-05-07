import { Context, type Effect } from "effect";

import type {
  AttachmentBadMimeError,
  AttachmentTooLargeError,
  SessionId,
  SessionNotFoundError,
} from "@forkzero/wire";

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
}

export class AttachmentService extends Context.Tag("forkzero/AttachmentService")<
  AttachmentService,
  AttachmentServiceShape
>() {}
