const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

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
  if (tag !== null) return tag;

  try {
    return JSON.stringify(err, null, 2);
  } catch {
    return String(err);
  }
};
