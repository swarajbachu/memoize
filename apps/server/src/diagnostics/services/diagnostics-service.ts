import { Context, type Effect } from "effect";

import type {
  DiagnosticsExportError,
  DiagnosticsExportResult,
} from "@zuse/wire";

export interface DiagnosticsServiceShape {
  readonly exportBundle: () => Effect.Effect<
    DiagnosticsExportResult,
    DiagnosticsExportError
  >;
}

export class DiagnosticsService extends Context.Tag(
  "memoize/DiagnosticsService",
)<DiagnosticsService, DiagnosticsServiceShape>() {}
