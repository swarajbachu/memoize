#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

function usage() {
  return "Usage: bun run diagnostics:inspect <memoize-diagnostics.json>";
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function getDiagnosticId(bundle, inputPath) {
  const id = bundle?.manifest?.diagnosticId;
  if (typeof id === "string" && id.length > 0) return id;
  return basename(inputPath).replace(/[^A-Za-z0-9._-]+/g, "-");
}

function likelyIssue(traceSummary) {
  const first = traceSummary?.latestFailures?.[0];
  if (!first) {
    return "No recent persisted error messages were found in this diagnostics bundle.";
  }
  const span = typeof first.span === "string" ? first.span : "unknown span";
  const message =
    typeof first.message === "string"
      ? first.message
      : "No error message was captured.";
  return `${span}: ${message}`;
}

function relevantHints(traceSummary) {
  const failures = Array.isArray(traceSummary?.latestFailures)
    ? traceSummary.latestFailures
    : [];
  const providerIds = new Set(
    failures
      .map((failure) => failure?.providerId)
      .filter(
        (providerId) => typeof providerId === "string" && providerId.length > 0,
      ),
  );
  const spans = new Set(
    failures
      .map((failure) => failure?.span)
      .filter((span) => typeof span === "string" && span.length > 0),
  );

  const hints = new Set([
    "apps/server/src/provider/",
    "apps/server/src/provider/layers/message-store.ts",
    "apps/renderer/src/components/",
  ]);
  for (const providerId of providerIds) {
    hints.add(`apps/server/src/provider/drivers/${providerId}.ts`);
  }
  if ([...spans].some((span) => span.includes("message"))) {
    hints.add("packages/wire/src/session.ts");
  }
  return [...hints];
}

function buildReport({ diagnosticId, bundlePath, bundle }) {
  const traceSummary = bundle.artifacts?.["trace-summary"] ?? {};
  const recentErrors = bundle.artifacts?.["recent-errors"] ?? {};
  const providerStatus = bundle.artifacts?.["provider-status"] ?? {};
  const environment = bundle.artifacts?.environment ?? {};
  const latestFailures = Array.isArray(traceSummary.latestFailures)
    ? traceSummary.latestFailures
    : [];
  const firstTraceId =
    latestFailures.find((failure) => failure?.traceId)?.traceId ??
    "not captured";

  const lines = [
    "# Diagnostic Report",
    "",
    `Diagnostic ID: ${diagnosticId}`,
    `Source bundle: ${bundlePath}`,
    "",
    "## Likely Issue",
    "",
    likelyIssue(traceSummary),
    "",
    "## Relevant Trace",
    "",
    String(firstTraceId),
    "",
    "## Recent Failures",
    "",
  ];

  if (latestFailures.length === 0) {
    lines.push("No recent failures found.", "");
  } else {
    for (const failure of latestFailures.slice(0, 8)) {
      lines.push(
        `- ${failure.occurredAt ?? "unknown time"} · ${failure.span ?? "unknown span"} · ${failure.message ?? "no message"} · session=${failure.sessionId ?? "unknown"}`,
      );
    }
    lines.push("");
  }

  lines.push("## Provider Status", "");
  const providers = Array.isArray(providerStatus.providers)
    ? providerStatus.providers
    : [];
  if (providers.length === 0) {
    lines.push("No provider status captured.", "");
  } else {
    for (const provider of providers) {
      lines.push(
        `- ${provider.providerId}: status=${provider.status ?? "unknown"}, cliInstalled=${provider.cliInstalled}, auth=${provider.authStatus ?? "unknown"}, version=${provider.cliVersion ?? "unknown"}`,
      );
    }
    lines.push("");
  }

  lines.push("## Environment", "");
  lines.push(
    `- app=${environment.app ?? "unknown"} version=${environment.version ?? "unknown"} platform=${environment.platform ?? "unknown"} arch=${environment.arch ?? "unknown"} node=${environment.node ?? "unknown"}`,
    "",
  );

  lines.push("## Relevant Files To Inspect", "");
  for (const hint of relevantHints(traceSummary)) {
    lines.push(`- ${hint}`);
  }
  lines.push(
    "",
    "## Agent Prompt",
    "",
    `Debug this user issue using .context/diagnostics/${diagnosticId}/REPORT.md and the raw bundle files.`,
    "Find the root cause and propose or implement a fix. Do not include sensitive user content in the final summary.",
    "",
  );

  if (Array.isArray(recentErrors.errors) && recentErrors.errors.length > 0) {
    lines.push("## Raw Error Summary", "");
    for (const error of recentErrors.errors.slice(0, 12)) {
      lines.push(`- ${error.message ?? "no message"}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

const input = process.argv[2];
if (!input) {
  console.error(usage());
  process.exit(2);
}

const bundlePath = resolve(input);
const bundle = readJson(bundlePath);
const diagnosticId = getDiagnosticId(bundle, bundlePath);
const outputDir = resolve(".context", "diagnostics", diagnosticId);
mkdirSync(outputDir, { recursive: true });

writeJson(join(outputDir, "manifest.json"), bundle.manifest ?? {});
for (const [name, artifact] of Object.entries(bundle.artifacts ?? {})) {
  writeJson(join(outputDir, `${name}.json`), artifact);
}
writeJson(join(outputDir, basename(bundlePath)), bundle);

const report = buildReport({ diagnosticId, bundlePath, bundle });
writeFileSync(join(outputDir, "REPORT.md"), report, "utf8");

console.log(`Diagnostic ID: ${diagnosticId}`);
console.log(`Output: ${outputDir}`);
console.log("");
console.log(likelyIssue(bundle.artifacts?.["trace-summary"] ?? {}));
