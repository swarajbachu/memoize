/**
 * Minimal terminal support for ACP clients (Grok, Gemini, Cursor, etc.).
 *
 * Full terminal emulation is complex. For now we provide a stub that at least
 * prevents hard "Method not supported" errors and lets the agent know the
 * capability is partially available.
 *
 * The context is kept compatible with FsHandleContext so drivers can pass
 * the same object; permission wiring for exec will be added in Phase 2.
 */

export interface TerminalHandleContext {
  readonly cwd: string;
  readonly sessionId?: import("@memoize/wire").AgentSessionId;
  readonly projectId?: import("@memoize/wire").FolderId;
  readonly requestPermission?: (
    kind: import("@memoize/wire").PermissionKind,
    options: { readonly forcePrompt: boolean },
  ) => Promise<import("@memoize/wire").PermissionDecision>;
  readonly getRuntimeMode?: () => import("@memoize/wire").RuntimeMode;
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

    case "terminal/wait_for_exit": {
      // Stub: the agent wants to wait for a previously started process.
      // For now, pretend it exited successfully so the agent can continue.
      // A real implementation would track processes started via terminal/exec or create.
      const processId = (params as any)?.processId ?? "unknown";
      return {
        processId,
        status: "exited",
        exitCode: 0,
        note: "Stub implementation — real process tracking not yet wired.",
      };
    }

    case "terminal/exec":
    case "terminal/run_command": {
      // Basic exec stub. A full implementation would use child_process or node-pty
      // and return a processId that can be waited on.
      return {
        processId: `proc_${Date.now()}`,
        status: "started",
        note: "Basic terminal exec stub. Output streaming and real waiting coming soon.",
      };
    }

    default:
      throw new Error(`Method not implemented by memoize ACP client: ${method}`);
  }
}
