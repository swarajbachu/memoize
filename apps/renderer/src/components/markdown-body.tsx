import {
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent,
} from "react";
import { Maximize2, Move, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "~/lib/utils";

import { CodeBlock } from "./code-block.tsx";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "./ui/dialog.tsx";
import { Button } from "./ui/button.tsx";

const languageFromClassName = (className: unknown): string | undefined => {
  if (typeof className !== "string") return undefined;
  const match = /(?:^|\s)language-([^\s]+)/.exec(className);
  return match?.[1];
};

const textFromReactNode = (node: ReactNode): string => {
  if (typeof node === "string") return node;
  if (typeof node === "number" || typeof node === "bigint") {
    return String(node);
  }
  if (Array.isArray(node)) return node.map(textFromReactNode).join("");
  return "";
};

const codeChildFromPre = (node: ReactNode): ReactNode => {
  if (isValidElement(node) && node.type === "code") return node;
  if (Array.isArray(node)) {
    return node.find((child) => isValidElement(child) && child.type === "code");
  }
  return undefined;
};

type MermaidApi = typeof import("mermaid").default;

let mermaidPromise: Promise<MermaidApi> | null = null;
let mermaidId = 0;

const getMermaid = (): Promise<MermaidApi> => {
  mermaidPromise ??= import("mermaid").then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "base",
      themeVariables: {
        background: "transparent",
        mainBkg: "#18181b",
        primaryColor: "#18181b",
        primaryBorderColor: "#71717a",
        primaryTextColor: "#fafafa",
        secondaryColor: "#27272a",
        secondaryBorderColor: "#71717a",
        secondaryTextColor: "#fafafa",
        tertiaryColor: "#09090b",
        tertiaryBorderColor: "#52525b",
        tertiaryTextColor: "#f4f4f5",
        lineColor: "#a1a1aa",
        textColor: "#fafafa",
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      },
      themeCSS: `
        .cluster rect,
        .cluster path,
        .node rect,
        .node polygon,
        .node circle,
        .node ellipse {
          filter: none !important;
        }
      `,
    });
    return mermaid;
  });
  return mermaidPromise;
};

const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

const clampMermaidScale = (scale: number): number =>
  Math.min(3, Math.max(0.4, scale));

function MermaidSvg({ svg, className }: { svg: string; className?: string }) {
  return (
    <div
      className={cn("markdown-mermaid-svg", className)}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

function MermaidPanZoom({
  svg,
  className,
  toolbarExtra,
  resetOnMount = false,
}: {
  svg: string;
  className?: string;
  toolbarExtra?: ReactNode;
  resetOnMount?: boolean;
}) {
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const dragRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);

  const scrollToOrigin = () => {
    const viewer = viewerRef.current;
    if (viewer === null) return;
    viewer.scrollLeft = 0;
    viewer.scrollTop = 0;
  };

  const zoomBy = (delta: number) => {
    setScale((current) => clampMermaidScale(current + delta));
  };
  const resetView = () => {
    setScale(1);
    scrollToOrigin();
  };

  useEffect(() => {
    if (resetOnMount) resetView();
  }, [resetOnMount]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (viewer === null) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setScale((current) =>
        clampMermaidScale(current + (event.deltaY < 0 ? 0.12 : -0.12)),
      );
    };

    viewer.addEventListener("wheel", onWheel, { passive: false });
    return () => viewer.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      scrollLeft: event.currentTarget.scrollLeft,
      scrollTop: event.currentTarget.scrollTop,
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    event.currentTarget.scrollLeft = drag.scrollLeft - (event.clientX - drag.x);
    event.currentTarget.scrollTop = drag.scrollTop - (event.clientY - drag.y);
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  };

  return (
    <div className={cn("markdown-mermaid-shell", className)}>
      <div className="markdown-mermaid-viewer-controls">
        <Button
          aria-label="Zoom out"
          size="icon-xs"
          variant="ghost"
          onClick={() => zoomBy(-0.2)}
        >
          <ZoomOut />
        </Button>
        <div className="markdown-mermaid-zoom-label">
          {Math.round(scale * 100)}%
        </div>
        <Button
          aria-label="Zoom in"
          size="icon-xs"
          variant="ghost"
          onClick={() => zoomBy(0.2)}
        >
          <ZoomIn />
        </Button>
        <Button
          aria-label="Reset view"
          size="icon-xs"
          variant="ghost"
          onClick={resetView}
        >
          <RotateCcw />
        </Button>
        {toolbarExtra}
      </div>
      <div
        ref={viewerRef}
        className="markdown-mermaid-viewer"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          className="markdown-mermaid-viewer-canvas"
          style={{
            ["--markdown-mermaid-scale" as string]: scale,
          }}
        >
          <MermaidSvg svg={svg} />
        </div>
        <div className="markdown-mermaid-pan-hint">
          <Move className="size-3.5" />
        </div>
      </div>
    </div>
  );
}

function MermaidViewerDialog({
  open,
  onOpenChange,
  svg,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  svg: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup
        className="h-[min(88vh,860px)] max-w-[min(94vw,1220px)] overflow-hidden bg-background"
        bottomStickOnMobile={false}
      >
        <DialogHeader className="border-b bg-background px-5 py-4">
          <div className="flex min-w-0 items-center justify-between gap-3 pr-8">
            <div className="min-w-0">
              <DialogTitle className="text-base">Mermaid diagram</DialogTitle>
              <DialogDescription className="sr-only">
                Expanded Mermaid diagram viewer.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <MermaidPanZoom
          className="markdown-mermaid-shell-dialog"
          svg={svg}
          resetOnMount={open}
        />
      </DialogPopup>
    </Dialog>
  );
}

function MermaidDiagram({ source }: { source: string }) {
  const id = useMemo(() => {
    mermaidId += 1;
    return `markdown-mermaid-${mermaidId}`;
  }, []);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "rendered"; svg: string }
    | { status: "error"; message: string }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    void getMermaid()
      .then((mermaid) => mermaid.render(id, source))
      .then(({ svg }) => {
        if (!cancelled) setState({ status: "rendered", svg });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({ status: "error", message: errorMessage(err) });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [id, source]);

  if (state.status === "error") {
    return (
      <div className="markdown-mermaid-block markdown-mermaid-block-error">
        <div className="markdown-mermaid-error" role="alert">
          Could not render Mermaid diagram: {state.message}
        </div>
        <div className="markdown-code-block">
          <CodeBlock
            filename="diagram.mermaid"
            language="mermaid"
            text={source}
            maxHeight={360}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="markdown-mermaid-block">
      {state.status === "loading" ? (
        <div className="markdown-mermaid-loading">Rendering diagram...</div>
      ) : (
        <>
          <MermaidPanZoom
            className="markdown-mermaid-shell-inline"
            svg={state.svg}
            toolbarExtra={
              <Button
                aria-label="Open diagram viewer"
                size="icon-xs"
                variant="ghost"
                onClick={() => setViewerOpen(true)}
              >
                <Maximize2 />
              </Button>
            }
          />
          <MermaidViewerDialog
            open={viewerOpen}
            onOpenChange={setViewerOpen}
            svg={state.svg}
          />
        </>
      )}
    </div>
  );
}

/**
 * Shared markdown surface for PR descriptions, comments, review bodies, and
 * assistant chat bubbles. Reuses the `fz-prose` typography class already
 * tuned for chat messages so link colors / list spacing / code blocks stay
 * consistent across the app.
 *
 * All http(s) anchors are intercepted and handed to `shell.openExternal` via
 * the preload bridge so a click never navigates the renderer or opens a
 * child Electron window — every clicked link lands in the user's default
 * browser. Non-http schemes (e.g. `memoize://attachments/...`) are left to
 * their own handlers.
 */
export function MarkdownBody({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <div className={cn("fz-prose", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children, ...rest }) => (
            <a
              {...rest}
              href={href}
              onClick={(e) => {
                if (typeof href !== "string") return;
                if (!/^https?:\/\//i.test(href)) return;
                e.preventDefault();
                window.memoize?.app?.openExternal(href);
              }}
            >
              {children}
            </a>
          ),
          pre: ({ children }) => {
            const codeChild = codeChildFromPre(children);
            if (!isValidElement(codeChild)) {
              return <pre>{children}</pre>;
            }

            const codeProps = codeChild.props as {
              className?: string;
              children?: ReactNode;
            };
            const language = languageFromClassName(codeProps.className);
            const text = textFromReactNode(codeProps.children).replace(
              /\n$/,
              "",
            );
            if (language?.toLowerCase() === "mermaid") {
              return <MermaidDiagram source={text} />;
            }

            const filename =
              language === undefined ? "snippet.txt" : `snippet.${language}`;

            return (
              <div className="markdown-code-block">
                <CodeBlock
                  filename={filename}
                  language={language}
                  text={text}
                  maxHeight={360}
                />
              </div>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
