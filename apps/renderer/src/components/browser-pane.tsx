import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, RotateCw, Star } from "lucide-react";

/**
 * In-app Browser tab — toolbar (back/forward/refresh/URL bar) + Electron
 * `<webview>`. The webview runs in its own process with `nodeIntegration:
 * false` by default so arbitrary user-entered URLs can't reach the host.
 *
 * State is held locally: switching away from the Browser tab keeps the
 * component mounted (RightPane uses `hidden` toggling), so URL bar value
 * and the underlying webview's history stay alive across tab switches.
 * Reloading the renderer resets the URL to blank — persistence is out of
 * scope for v1.
 */
export function BrowserPane() {
  const webviewRef = useRef<HTMLElement | null>(null);
  const [url, setUrl] = useState<string>("");
  const [inputValue, setInputValue] = useState<string>("");
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Wire navigation lifecycle events onto the underlying webview element.
  // We attach via `addEventListener` because the webview tag isn't a real
  // React component — it's a Chromium-provided custom element.
  useEffect(() => {
    const el = webviewRef.current;
    if (el === null) return;
    const wv = el as WebviewElement;
    const syncNav = () => {
      try {
        setCanGoBack(wv.canGoBack());
        setCanGoForward(wv.canGoForward());
      } catch {
        // webview not ready yet — events fire later
      }
    };
    const onDidNavigate = (e: Event) => {
      const ev = e as Event & { url?: string };
      if (typeof ev.url === "string") {
        setUrl(ev.url);
        setInputValue(ev.url);
      }
      syncNav();
    };
    const onStart = () => setIsLoading(true);
    const onStop = () => {
      setIsLoading(false);
      syncNav();
    };
    el.addEventListener("did-navigate", onDidNavigate);
    el.addEventListener("did-navigate-in-page", onDidNavigate);
    el.addEventListener("did-start-loading", onStart);
    el.addEventListener("did-stop-loading", onStop);
    el.addEventListener("dom-ready", syncNav);
    return () => {
      el.removeEventListener("did-navigate", onDidNavigate);
      el.removeEventListener("did-navigate-in-page", onDidNavigate);
      el.removeEventListener("did-start-loading", onStart);
      el.removeEventListener("did-stop-loading", onStop);
      el.removeEventListener("dom-ready", syncNav);
    };
  }, []);

  const navigate = (next: string) => {
    const resolved = resolveUrl(next);
    if (resolved === null) return;
    setUrl(resolved);
    setInputValue(resolved);
    const wv = webviewRef.current as WebviewElement | null;
    // Setting `src` programmatically also works, but loadURL is more
    // predictable when the same URL is re-entered (forces a reload).
    if (wv !== null) {
      try {
        void wv.loadURL(resolved);
      } catch {
        wv.src = resolved;
      }
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim() === "") return;
    navigate(inputValue.trim());
  };

  const go = (dir: "back" | "forward") => {
    const wv = webviewRef.current as WebviewElement | null;
    if (wv === null) return;
    try {
      if (dir === "back" && wv.canGoBack()) wv.goBack();
      if (dir === "forward" && wv.canGoForward()) wv.goForward();
    } catch {
      // ignore
    }
  };

  const reload = () => {
    const wv = webviewRef.current as WebviewElement | null;
    if (wv === null) return;
    try {
      if (isLoading) wv.stop();
      else wv.reload();
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-background">
      <form
        onSubmit={onSubmit}
        className="flex h-9 shrink-0 items-center gap-1 border-b border-border px-2 text-xs"
      >
        <ToolbarButton
          onClick={() => go("back")}
          disabled={!canGoBack}
          ariaLabel="Back"
        >
          <ArrowLeft className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => go("forward")}
          disabled={!canGoForward}
          ariaLabel="Forward"
        >
          <ArrowRight className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={reload}
          disabled={url === ""}
          ariaLabel={isLoading ? "Stop" : "Reload"}
        >
          <RotateCw
            className={`size-3.5 ${isLoading ? "animate-spin" : ""}`}
          />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => {
            /* bookmark placeholder */
          }}
          disabled={true}
          ariaLabel="Bookmark"
        >
          <Star className="size-3.5" />
        </ToolbarButton>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Search or enter URL"
          spellCheck={false}
          className="flex-1 rounded bg-transparent px-2 py-1 text-[12px] text-foreground outline-none placeholder:text-muted-foreground/70 focus:bg-muted/40"
        />
      </form>
      <div className="relative min-h-0 flex-1">
        {url === "" ? (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            Type a URL above to start browsing.
          </div>
        ) : null}
        <webview
          ref={webviewRef as unknown as React.RefObject<HTMLElement>}
          src={url === "" ? "about:blank" : url}
          allowpopups={true}
          style={{
            display: url === "" ? "none" : "flex",
            width: "100%",
            height: "100%",
          }}
        />
      </div>
    </div>
  );
}

function ToolbarButton({
  onClick,
  disabled,
  ariaLabel,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
    >
      {children}
    </button>
  );
}

// Best-effort URL normalization: a string with a scheme passes through,
// bare host[:port][/path] becomes https://… (except localhost / IP literals
// which default to http so dev servers work without typing the scheme).
function resolveUrl(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  const isLocal =
    /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/|$)/i.test(trimmed);
  return `${isLocal ? "http" : "https"}://${trimmed}`;
}

// Minimal surface of Electron's WebviewTag we actually use. Keeps the file
// free of an `electron` import in the renderer (renderer is sandboxed and
// imports from `electron` would land us in preload territory).
type WebviewElement = HTMLElement & {
  src: string;
  loadURL: (url: string) => Promise<void>;
  reload: () => void;
  stop: () => void;
  goBack: () => void;
  goForward: () => void;
  canGoBack: () => boolean;
  canGoForward: () => boolean;
};
