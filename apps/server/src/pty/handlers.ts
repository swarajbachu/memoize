import { ForkzeroRpcs } from "@forkzero/wire";
import { Effect, Layer, Stream } from "effect";

import { PtyService } from "./services/pty-service.ts";

const Open = ForkzeroRpcs.toLayerHandler("pty.open", ({ cwd, cols, rows }) =>
  Effect.flatMap(PtyService, (svc) => svc.open(cwd, cols, rows)),
);

const Write = ForkzeroRpcs.toLayerHandler("pty.write", ({ ptyId, data }) =>
  Effect.flatMap(PtyService, (svc) => svc.write(ptyId, data)),
);

const Resize = ForkzeroRpcs.toLayerHandler(
  "pty.resize",
  ({ ptyId, cols, rows }) =>
    Effect.flatMap(PtyService, (svc) => svc.resize(ptyId, cols, rows)),
);

const Close = ForkzeroRpcs.toLayerHandler("pty.close", ({ ptyId }) =>
  Effect.flatMap(PtyService, (svc) => svc.close(ptyId)),
);

const Output = ForkzeroRpcs.toLayerHandler("pty.output", ({ ptyId }) =>
  Stream.unwrap(Effect.map(PtyService, (svc) => svc.subscribe(ptyId))),
);

export const PtyHandlersLayer = Layer.mergeAll(
  Open,
  Write,
  Resize,
  Close,
  Output,
);
