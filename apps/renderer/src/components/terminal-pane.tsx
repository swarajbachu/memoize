import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { Effect, Fiber, Stream } from "effect";

import type { Folder, PtyId } from "@memoize/wire";

import { getRpcClient } from "../lib/rpc-client.ts";
import { useActiveWorkspaceRoot } from "../store/active-workspace.ts";
import { useWorkspaceStore } from "../store/workspace.ts";

export function TerminalPane() {
  const folders = useWorkspaceStore((s) => s.folders);
  const selectedFolderId = useWorkspaceStore((s) => s.selectedFolderId);
  const selected = selectedFolderId
    ? (folders.find((f) => f.id === selectedFolderId) ?? null)
    : null;
  const activeRoot = useActiveWorkspaceRoot(
    selectedFolderId ?? ("" as Folder["id"]),
  );

  if (selected === null) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background text-sm text-muted-foreground">
        No folder selected. Add or pick a folder on the left.
      </div>
    );
  }

  // `key` includes the resolved cwd so toggling a session's worktree
  // re-mounts the pane with a fresh PTY rooted in the new path. Live cwd
  // migration of an existing PTY is out of scope.
  const cwd = activeRoot ?? selected.path;
  return (
    <PtyTerminal key={`${selected.id}:${cwd}`} folder={selected} cwd={cwd} />
  );
}

// xterm's canvas/webgl renderer takes literal color strings, not CSS vars,
// so we resolve our shadcn tokens to computed rgb() strings via a probe span.
// `getComputedStyle().color` always returns a normalized rgb()/rgba() the
// renderer can parse, regardless of whether the var is defined in oklch().
function readToken(el: HTMLElement, cssVar: string, fallback: string): string {
  const probe = document.createElement("span");
  probe.style.color = `var(${cssVar})`;
  probe.style.display = "none";
  el.appendChild(probe);
  const computed = getComputedStyle(probe).color;
  probe.remove();
  return computed || fallback;
}

function PtyTerminal({ folder, cwd }: { folder: Folder; cwd: string }) {
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
      // Transparent canvas so the parent pane's `bg-background` shows through.
      // This keeps the terminal in sync with theme changes without re-mounting.
      allowTransparency: true,
      theme: {
        background: "rgba(0, 0, 0, 0)",
        foreground: readToken(container, "--foreground", "#e6e6e6"),
        cursor: readToken(container, "--primary", "#e6e6e6"),
        cursorAccent: readToken(container, "--background", "#0b0b0c"),
        selectionBackground: readToken(container, "--accent", "#2c2c33"),
        selectionForeground: readToken(container, "--accent-foreground", "#e6e6e6"),
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);

    // Don't fit synchronously — the parent grid hasn't laid out yet on first
    // render, so xterm's renderer has no dimensions and FitAddon throws
    // "Cannot read properties of undefined (reading 'dimensions')". The
    // ResizeObserver below fires once after observe with real measurements.
    const safeFit = () => {
      if (container.clientWidth === 0 || container.clientHeight === 0) return;
      try {
        fit.fit();
      } catch {
        // ignore — happens during teardown when the container is detached
      }
    };

    let cancelled = false;
    let ptyId: PtyId | null = null;
    let dataDisposable: { dispose: () => void } | null = null;
    let streamFiber: Fiber.RuntimeFiber<unknown, unknown> | null = null;
    let resizeTimer: number | null = null;

    const observer = new ResizeObserver(safeFit);
    observer.observe(container);

    void (async () => {
      try {
        const client = await getRpcClient();
        if (cancelled) return;

        const { ptyId: id } = await Effect.runPromise(
          client.pty.open({
            cwd,
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
        console.error("[memoize] failed to open pty:", err);
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
  }, [folder.id, cwd]);

  return (
    <div ref={containerRef} className="h-full w-full bg-background p-2" />
  );
}
