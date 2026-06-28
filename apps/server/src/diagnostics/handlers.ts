import { MemoizeRpcs } from "@memoize/wire";
import { Effect, Layer } from "effect";

import { DiagnosticsService } from "./services/diagnostics-service.ts";

const ExportBundle = MemoizeRpcs.toLayerHandler("diagnostics.export", () =>
  Effect.flatMap(DiagnosticsService, (svc) => svc.exportBundle()),
);

export const DiagnosticsHandlersLayer = Layer.mergeAll(ExportBundle);
