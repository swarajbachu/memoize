const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

// Tagged errors that carry only ids (no `reason`/`message`) would otherwise
// fall through to a raw JSON dump like `{ "folderId": "…" }`. Map them to
// human copy here so any surface that formats them stays readable.
const TAG_MESSAGES: Record<string, string> = {
  GitNotARepoError: "This folder isn't a Git repository.",
  GitFolderNotFoundError: "Project folder not found.",
  GitNotInstalledError: "Git is not installed.",
  FsFolderNotFoundError: "Project folder not found.",
};

export const formatError = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (!isRecord(err)) return String(err);

  const tag = typeof err["_tag"] === "string" ? err["_tag"] : null;
  const reason = typeof err["reason"] === "string" ? err["reason"] : null;
  const message = typeof err["message"] === "string" ? err["message"] : null;
  const providerId =
    typeof err["providerId"] === "string" ? err["providerId"] : null;
  const sessionId =
    typeof err["sessionId"] === "string" ? err["sessionId"] : null;

  if (reason !== null && reason.length > 0) {
    const provider = providerId !== null ? `${providerId}: ` : "";
    return tag !== null ? `${tag}: ${provider}${reason}` : `${provider}${reason}`;
  }
  if (message !== null && message.length > 0) {
    return tag !== null ? `${tag}: ${message}` : message;
  }
  if (sessionId !== null && Object.keys(err).length === 1) {
    return `Internal session response was routed as an error: ${sessionId}`;
  }
  if (tag !== null) return TAG_MESSAGES[tag] ?? tag;

  try {
    return JSON.stringify(err, null, 2);
  } catch {
    return String(err);
  }
};
