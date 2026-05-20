/**
 * Minimal terminal support for ACP clients (Grok, Gemini, Cursor, etc.).
 *
 * Full terminal emulation is complex. For now we provide a stub that at least
 * prevents hard "Method not supported" errors and lets the agent know the
 * capability is partially available.
 */

export interface TerminalHandleContext {
  readonly cwd: string;
}

export async function handleTerminalRequest(
  method: string,
  params: unknown,
  ctx: TerminalHandleContext,
): Promise<unknown> {
  switch (method) {
    case "terminal/create":
    case "terminal/createSession": {
      // The agent wants to open a pseudo-terminal.
      // For now we return a fake id and let it know we don't support rich PTY yet.
      // This is better than a hard error.
      return {
        terminalId: `term_${Date.now()}`,
        status: "created",
        note: "Basic terminal support only. Full PTY + resize not yet implemented.",
      };
    }

    case "terminal/write":
    case "terminal/input": {
      // Swallow input for now
      return { status: "written" };
    }

    case "terminal/close":
    case "terminal/kill": {
      return { status: "closed" };
    }

    default:
      throw new Error(`Method not implemented by memoize ACP client: ${method}`);
  }
}
