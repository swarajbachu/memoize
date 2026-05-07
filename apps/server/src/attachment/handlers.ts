import { ForkzeroRpcs } from "@forkzero/wire";
import { Effect, Layer } from "effect";

import { AttachmentService } from "./services/attachment-service.ts";

const Upload = ForkzeroRpcs.toLayerHandler(
  "attachments.upload",
  ({ sessionId, bytes, mimeType, originalName }) =>
    Effect.flatMap(AttachmentService, (svc) =>
      svc.upload(sessionId, bytes, mimeType, originalName),
    ),
);

const Touch = ForkzeroRpcs.toLayerHandler("attachments.touch", ({ ids }) =>
  Effect.flatMap(AttachmentService, (svc) => svc.touch(ids)),
);

export const AttachmentHandlersLayer = Layer.mergeAll(Upload, Touch);
