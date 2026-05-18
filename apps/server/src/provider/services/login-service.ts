import { Effect, Mailbox, type Scope, Stream } from "effect";
import {
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import * as readline from "node:readline";
import { homedir } from "node:os";

import {
  AgentSessionStartError,
  type LoginEvent,
  type ProviderId,
} from "@memoize/wire";

// Cursor-agent's login command prints an OAuth URL to stdout (or to stderr
// inside its TUI frame) and waits for the user to complete the flow in their
// browser. We anchor on the cursor.com / cursor.sh / cursor.so hosts to avoid
// matching install-instruction URLs the CLI may also print on startup.
const CURSOR_URL_PATTERN =
  /https?:\/\/[^\s]*cursor\.(?:com|sh|so)\/[^\s]*/i;
const ANSI_PATTERN = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

/**
 * Spawn a provider's interactive login subcommand and stream progress back
 * to the renderer. Today only `cursor` has a real handler — other providers
 * resolve to an immediate `{ kind: "done", ok: false, reason: … }`.
 *
 * Cancellation: the stream is wrapped in `Stream.unwrapScoped`, so when the
 * renderer unsubscribes (or the IPC drops), the scope closes and the
 * registered finalizer kills the child process with SIGTERM (escalating to
 * SIGKILL after a short grace period).
 */
export const startProviderLogin = (
  providerId: ProviderId,
): Stream.Stream<LoginEvent, AgentSessionStartError> => {
  if (providerId !== "cursor") {
    const event: LoginEvent = {
      _tag: "done",
      ok: false,
      reason: `Login flow not supported for ${providerId}`,
    };
    return Stream.succeed(event);
  }
  return Stream.unwrapScoped(spawnCursorLogin);
};

const spawnCursorLogin: Effect.Effect<
  Stream.Stream<LoginEvent>,
  AgentSessionStartError,
  Scope.Scope
> = Effect.gen(function* () {
  const mailbox = yield* Mailbox.make<LoginEvent>();

  // Spawn into the user's home dir — login doesn't touch the project tree
  // and we don't want a project-local stale state to interfere.
  let child: ChildProcessWithoutNullStreams;
  try {
    child = spawn("cursor-agent", ["login"], {
      cwd: homedir(),
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (cause) {
    yield* mailbox.end;
    return yield* Effect.fail(
      new AgentSessionStartError({
        providerId: "cursor",
        reason: cause instanceof Error ? cause.message : String(cause),
      }),
    );
  }

  child.stdout.setEncoding("utf-8");
  child.stderr.setEncoding("utf-8");

  let urlEmitted = false;
  let exited = false;

  const handleLine = (raw: string): void => {
    const cleaned = raw.replace(ANSI_PATTERN, "").trim();
    if (cleaned.length === 0) return;
    mailbox.unsafeOffer({ _tag: "log", text: cleaned });
    if (!urlEmitted) {
      const m = cleaned.match(CURSOR_URL_PATTERN);
      if (m !== null) {
        urlEmitted = true;
        mailbox.unsafeOffer({ _tag: "url", url: m[0] });
      }
    }
  };

  const rlOut = readline.createInterface({ input: child.stdout });
  const rlErr = readline.createInterface({ input: child.stderr });
  rlOut.on("line", handleLine);
  rlErr.on("line", handleLine);

  child.once("exit", (code, signal) => {
    exited = true;
    const ok = code === 0;
    const reason = ok
      ? undefined
      : signal !== null
        ? `cursor-agent login was terminated (${signal})`
        : `cursor-agent login exited with code ${code ?? "?"}`;
    mailbox.unsafeOffer({
      _tag: "done",
      ok,
      ...(reason !== undefined ? { reason } : {}),
    });
    void mailbox.end.pipe(Effect.runPromise);
  });

  child.once("error", (err) => {
    exited = true;
    mailbox.unsafeOffer({
      _tag: "done",
      ok: false,
      reason: err.message,
    });
    void mailbox.end.pipe(Effect.runPromise);
  });

  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      rlOut.close();
      rlErr.close();
      if (exited) return;
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      setTimeout(() => {
        if (!exited) {
          try {
            child.kill("SIGKILL");
          } catch {
            /* ignore */
          }
        }
      }, 1_000);
    }),
  );

  return Mailbox.toStream(mailbox);
});
