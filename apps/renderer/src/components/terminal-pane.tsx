import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

export function TerminalPane() {
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
      convertEol: true,
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

    term.writeln("\x1b[38;5;111mzurich\x1b[0m  terminal-for-agents · scaffolding build");
    term.writeln("type to echo locally — PTY wiring lands in the next plan");
    term.write("\r\n$ ");

    // Local echo so we can prove the terminal works end-to-end before PTY
    // wiring exists. Remove once node-pty is bridged in.
    const onData = term.onData((data) => {
      for (const ch of data) {
        const code = ch.charCodeAt(0);
        if (code === 13) {
          term.write("\r\n$ ");
        } else if (code === 127) {
          term.write("\b \b");
        } else {
          term.write(ch);
        }
      }
    });

    const observer = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        // ignore — happens during teardown when the container is detached
      }
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      onData.dispose();
      term.dispose();
    };
  }, []);

  return <div ref={containerRef} className="h-full w-full bg-[var(--color-bg)] p-2" />;
}
