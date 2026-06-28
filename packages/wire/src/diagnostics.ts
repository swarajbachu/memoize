import { Rpc } from "@effect/rpc";
import { Schema } from "effect";

const DiagnosticArtifactName = Schema.Literal(
  "manifest",
  "trace-summary",
  "recent-errors",
  "environment",
  "provider-status",
  "redacted-session-events",
);

export class DiagnosticsExportResult extends Schema.Class<DiagnosticsExportResult>(
  "DiagnosticsExportResult",
)({
  diagnosticId: Schema.String,
  createdAt: Schema.DateFromString,
  bundlePath: Schema.String,
  summary: Schema.String,
  agentPrompt: Schema.String,
  included: Schema.Array(DiagnosticArtifactName),
}) {}

export class DiagnosticsExportError extends Schema.TaggedError<DiagnosticsExportError>()(
  "DiagnosticsExportError",
  {
    reason: Schema.String,
  },
) {}

export const DiagnosticsExportRpc = Rpc.make("diagnostics.export", {
  payload: Schema.Struct({}),
  success: DiagnosticsExportResult,
  error: DiagnosticsExportError,
});
