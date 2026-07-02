import { MemoizeRpcs } from "@zuse/wire";
import { Effect, Layer } from "effect";

import { AttachmentService } from "./services/attachment-service.ts";

const Upload = MemoizeRpcs.toLayerHandler(
  "attachments.upload",
  ({ sessionId, bytes, mimeType, originalName }) =>
    Effect.flatMap(AttachmentService, (svc) =>
      svc.upload(sessionId, bytes, mimeType, originalName),
    ),
);

const Touch = MemoizeRpcs.toLayerHandler("attachments.touch", ({ ids }) =>
  Effect.flatMap(AttachmentService, (svc) => svc.touch(ids)),
);

export const AttachmentHandlersLayer = Layer.mergeAll(Upload, Touch);
