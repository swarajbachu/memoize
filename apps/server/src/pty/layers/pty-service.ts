import * as pty from "node-pty";
import { Effect, Exit, Layer, Mailbox, Ref, Stream } from "effect";

import {
  PtyDataEvent,
  PtyExitEvent,
  PtyId,
  PtyNotFoundError,
  PtySpawnError,
  type PtyEvent,
} from "@forkzero/wire";

import { PtyService } from "../services/pty-service.ts";

interface ActivePty {
  readonly pty: pty.IPty;
  readonly mailbox: Mailbox.Mailbox<typeof PtyEvent.Type, PtyNotFoundError>;
}

const defaultShell = (): string => {
  if (process.platform === "win32") {
    return process.env.COMSPEC ?? "cmd.exe";
  }
  return process.env.SHELL ?? "/bin/bash";
};

export const PtyServiceLive = Layer.effect(
  PtyService,
  Effect.gen(function* () {
    const ref = yield* Ref.make<ReadonlyMap<PtyId, ActivePty>>(new Map());

    const open: PtyService["Type"]["open"] = (cwd, cols, rows) =>
      Effect.gen(function* () {
        const id = PtyId.make(crypto.randomUUID());

        const mailbox = yield* Mailbox.make<
          typeof PtyEvent.Type,
          PtyNotFoundError
        >();

        const child = yield* Effect.try({
          try: () =>
            pty.spawn(defaultShell(), [], {
              name: "xterm-256color",
              cols,
              rows,
              cwd,
              env: {
                ...(process.env as Record<string, string>),
                TERM: "xterm-256color",
              },
            }),
          catch: (err) =>
            new PtySpawnError({
              reason: err instanceof Error ? err.message : String(err),
            }),
        });

        child.onData((bytes) => {
          mailbox.unsafeOffer(PtyDataEvent.make({ bytes }));
        });

        child.onExit(({ exitCode, signal }) => {
          mailbox.unsafeOffer(
            PtyExitEvent.make({
              exitCode: exitCode ?? null,
              signal: signal ?? null,
            }),
          );
          mailbox.unsafeDone(Exit.void);
          Effect.runSync(
            Ref.update(ref, (m) => {
              const next = new Map(m);
              next.delete(id);
              return next;
            }),
          );
        });

        yield* Ref.update(ref, (m) => {
          const next = new Map(m);
          next.set(id, { pty: child, mailbox });
          return next;
        });

        return { ptyId: id };
      });

    const getActive = (
      ptyId: PtyId,
    ): Effect.Effect<ActivePty, PtyNotFoundError> =>
      Effect.flatMap(Ref.get(ref), (m) => {
        const active = m.get(ptyId);
        return active === undefined
          ? Effect.fail(new PtyNotFoundError({ ptyId }))
          : Effect.succeed(active);
      });

    const write: PtyService["Type"]["write"] = (ptyId, data) =>
      Effect.flatMap(getActive(ptyId), ({ pty: child }) =>
        Effect.sync(() => child.write(data)),
      );

    const resize: PtyService["Type"]["resize"] = (ptyId, cols, rows) =>
      Effect.flatMap(getActive(ptyId), ({ pty: child }) =>
        Effect.sync(() => {
          try {
            child.resize(Math.max(1, cols), Math.max(1, rows));
          } catch {
            // pty may have exited between the renderer's last render and
            // this resize call — safe to ignore.
          }
        }),
      );

    const close: PtyService["Type"]["close"] = (ptyId) =>
      Effect.flatMap(getActive(ptyId), ({ pty: child }) =>
        Effect.sync(() => {
          try {
            child.kill();
          } catch {
            // already dead
          }
        }),
      );

    const subscribe: PtyService["Type"]["subscribe"] = (ptyId) =>
      Stream.unwrap(
        Effect.map(getActive(ptyId), ({ mailbox }) =>
          Mailbox.toStream(mailbox),
        ),
      );

    return { open, write, resize, close, subscribe } as const;
  }),
);
