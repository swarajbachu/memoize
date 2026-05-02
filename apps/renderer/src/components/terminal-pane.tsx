import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { Effect, Fiber, Stream } from "effect";

import type { Folder, PtyId } from "@forkzero/wire";

import { getRpcClient } from "../lib/rpc-client.ts";
import { useWorkspaceStore } from "../store/workspace.ts";

export function TerminalPane() {
  const folders = useWorkspaceStore((s) => s.folders);
  const selectedFolderId = useWorkspaceStore((s) => s.selectedFolderId);
  const selected = selectedFolderId
    ? (folders.find((f) => f.id === selectedFolderId) ?? null)
    : null;

  if (selected === null) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[var(--color-bg)] text-sm text-[var(--color-fg-muted)]">
        No folder selected. Add or pick a folder on the left.
      </div>
    );
  }

  // Force a fresh PTY when the folder changes by keying on folder.id.
  return <PtyTerminal key={selected.id} folder={selected} />;
}

function PtyTerminal({ folder }: { folder: Folder }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      fontFamily:
        '"SF Mono", "JetBrains Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace',
      fontSize: 13,
      lineHeight: 1.3,
      cursorBlink: true,
      convertEol: false,
      theme: {
        background: "#0b0b0c",
        foreground: "#e6e6e6",
        cursor: "#7c8cf8",
        selectionBackground: "#2c2c33",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    fit.fit();

    let cancelled = false;
    let ptyId: PtyId | null = null;
    let dataDisposable: { dispose: () => void } | null = null;
    let streamFiber: Fiber.RuntimeFiber<unknown, unknown> | null = null;
    let resizeTimer: number | null = null;

    const observer = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        // ignore — happens during teardown when the container is detached
      }
    });
    observer.observe(container);

    void (async () => {
      try {
        const client = await getRpcClient();
        if (cancelled) return;

        const { ptyId: id } = await Effect.runPromise(
          client.pty.open({
            cwd: folder.path,
            cols: term.cols,
            rows: term.rows,
          }),
        );
        if (cancelled) {
          void Effect.runPromise(client.pty.close({ ptyId: id }));
          return;
        }
        ptyId = id;

        // Pump output stream into xterm.
        streamFiber = Effect.runFork(
          Stream.runForEach(client.pty.output({ ptyId: id }), (event) =>
            Effect.sync(() => {
              if (event._tag === "data") {
                term.write(event.bytes);
              } else {
                const note =
                  event.exitCode === null
                    ? "[process exited]"
                    : `[process exited with code ${event.exitCode}]`;
                term.write(`\r\n\x1b[38;5;244m${note}\x1b[0m\r\n`);
              }
            }),
          ),
        );

        // Forward keystrokes to the pty.
        dataDisposable = term.onData((data) => {
          void Effect.runPromise(client.pty.write({ ptyId: id, data })).catch(
            () => {
              // pty exited; ignore
            },
          );
        });

        // Send debounced resizes.
        const sendResize = () => {
          if (ptyId === null) return;
          void Effect.runPromise(
            client.pty.resize({ ptyId, cols: term.cols, rows: term.rows }),
          ).catch(() => {
            // ignore
          });
        };
        const onTermResize = term.onResize(() => {
          if (resizeTimer !== null) window.clearTimeout(resizeTimer);
          resizeTimer = window.setTimeout(sendResize, 100);
        });
        // Also tie the disposable cleanup chain.
        const prevDispose = dataDisposable.dispose.bind(dataDisposable);
        dataDisposable = {
          dispose: () => {
            prevDispose();
            onTermResize.dispose();
          },
        };
      } catch (err) {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.error("[forkzero] failed to open pty:", err);
        term.write(
          "\r\n\x1b[38;5;203mfailed to open terminal — see devtools console\x1b[0m\r\n",
        );
      }
    })();

    return () => {
      cancelled = true;
      observer.disconnect();
      dataDisposable?.dispose();
      if (streamFiber !== null) {
        void Effect.runPromise(Fiber.interrupt(streamFiber));
      }
      if (resizeTimer !== null) window.clearTimeout(resizeTimer);
      if (ptyId !== null) {
        const id = ptyId;
        void getRpcClient().then((client) =>
          Effect.runPromise(client.pty.close({ ptyId: id })).catch(() => {
            // already closed
          }),
        );
      }
      term.dispose();
    };
  }, [folder.id, folder.path]);

  return (
    <div ref={containerRef} className="h-full w-full bg-[var(--color-bg)] p-2" />
  );
}
