import {
  BubbleChatIcon,
  Copy01Icon,
  CursorMagicSelection02Icon,
  Tick01Icon,
} from "@hugeicons-pro/core-bulk-rounded";
import { HugeiconsIcon } from "@hugeicons/react";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "~/lib/utils";

import { useAddAnnotation } from "../annotation/use-add-annotation.ts";

/**
 * A selection reported by the in-iframe annotate script. `rect` is in the
 * iframe's own viewport coordinates; the parent adds the iframe's on-screen
 * offset to place the comment popup. `text` is present only for text-range
 * selections (vs whole-element picks).
 */
interface PendingPick {
  readonly selector: string;
  readonly label: string;
  readonly text?: string;
  readonly rect: { left: number; top: number; bottom: number };
}

const MAX_HEIGHT = 820;

/**
 * Page-side script injected into the sandboxed artifact iframe. Runs in an
 * opaque origin (sandbox is `allow-scripts` only — no `allow-same-origin`), so
 * it can read its own DOM and `postMessage` the parent but can't touch the
 * app. Responsibilities: report content height for auto-sizing, and — while
 * annotate mode is on — highlight the hovered element and post the clicked
 * element / selected text back to the host.
 *
 * Kept as a hand-written string (no template literals) so it concatenates
 * cleanly onto arbitrary agent HTML. The closing tag is split at the very end
 * so this source file never contains a literal `</script>`.
 */
const INJECT = [
  "<script>(function(){",
  "var mode=false,hl=null,prevOutline='';",
  "function clearHl(){if(hl){hl.style.outline=prevOutline;hl=null;}}",
  "function sel(el){",
  "  if(!el||el.nodeType!==1||el===document.body||el===document.documentElement)return 'body';",
  "  if(el.id)return '#'+CSS.escape(el.id);",
  "  var parts=[],node=el;",
  "  while(node&&node.nodeType===1&&node!==document.body){",
  "    var tag=node.tagName.toLowerCase(),p=node.parentNode;",
  "    if(node.id){parts.unshift('#'+CSS.escape(node.id));break;}",
  "    if(p){var same=Array.prototype.filter.call(p.children,function(c){return c.tagName===node.tagName;});",
  "      if(same.length>1)tag+=':nth-of-type('+(same.indexOf(node)+1)+')';}",
  "    parts.unshift(tag);node=p;}",
  "  return parts.join(' > ');",
  "}",
  "function label(el){",
  "  if(!el||el.nodeType!==1)return 'text';",
  "  var t=(el.innerText||el.textContent||'').replace(/\\s+/g,' ').trim().slice(0,40);",
  "  var tag=el.tagName.toLowerCase();return t?tag+' \"'+t+'\"':tag;",
  "}",
  "function reportH(){try{parent.postMessage({type:'mz-height',value:document.documentElement.scrollHeight},'*');}catch(e){}}",
  "window.addEventListener('message',function(e){var d=e.data;if(d&&d.type==='mz-mode'){mode=!!d.on;clearHl();document.body.style.cursor=mode?'crosshair':'';}});",
  "document.addEventListener('mouseover',function(e){if(!mode)return;clearHl();hl=e.target;prevOutline=hl.style.outline;hl.style.outline='2px solid #84cc16';hl.style.outlineOffset='1px';},true);",
  "document.addEventListener('mouseout',function(){if(mode)clearHl();},true);",
  "document.addEventListener('click',function(e){",
  "  if(!mode)return;e.preventDefault();e.stopPropagation();",
  "  if(window.getSelection&&String(window.getSelection()).trim())return;",
  "  var el=e.target,r=el.getBoundingClientRect();",
  "  parent.postMessage({type:'mz-pick',selector:sel(el),label:label(el),rect:{left:r.left,top:r.top,bottom:r.bottom}},'*');",
  "},true);",
  "document.addEventListener('mouseup',function(){",
  "  if(!mode)return;var s=window.getSelection();var txt=s?s.toString().replace(/\\s+/g,' ').trim():'';",
  "  if(!txt)return;var n=s.anchorNode;n=n&&n.nodeType===3?n.parentElement:n;",
  "  var r=s.getRangeAt(0).getBoundingClientRect();",
  "  parent.postMessage({type:'mz-text',text:txt.slice(0,200),selector:sel(n),label:label(n),rect:{left:r.left,top:r.top,bottom:r.bottom}},'*');",
  "});",
  // Re-report after late reflow too — CDN runtimes (Tailwind browser, Mermaid)
  // restyle the DOM well after first paint, which changes the content height.
  "window.addEventListener('load',reportH);[50,400,1000,2000].forEach(function(t){setTimeout(reportH,t);});",
  "try{new ResizeObserver(reportH).observe(document.documentElement);}catch(e){}",
  "})();",
].join("\n") + "</scr" + "ipt>";

/**
 * Embedded, annotatable HTML artifact — the rendered-HTML analogue of the code
 * annotation flow. Renders agent-produced HTML (a plan body or a fenced `html`
 * block) in a sandboxed iframe. Toggling "Annotate" lets the user click an
 * element or select text inside the rendered preview and pin a comment; the
 * annotation drops into the same per-session tray above the composer and
 * serialises into the next prompt, so the agent can revise the exact node it
 * produced.
 */
export function HtmlArtifact({
  source,
  sourceRef,
}: {
  readonly source: string;
  readonly sourceRef: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState(120);
  const [annotateMode, setAnnotateMode] = useState(false);
  const [pending, setPending] = useState<PendingPick | null>(null);
  const [comment, setComment] = useState("");
  const [copied, setCopied] = useState(false);
  const addAnnotation = useAddAnnotation();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const srcDoc = source + INJECT;

  // Listen for the iframe's height + selection messages. Filter by the
  // iframe's own contentWindow — the sandbox gives it an opaque ("null")
  // origin, so we identify it by window identity rather than `event.origin`.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return;
      const d = e.data as
        | { type: "mz-height"; value: number }
        | { type: "mz-pick" | "mz-text"; selector: string; label: string; text?: string; rect: PendingPick["rect"] }
        | undefined;
      if (d === undefined || typeof d !== "object") return;
      if (d.type === "mz-height") {
        setHeight(Math.min(MAX_HEIGHT, Math.max(60, Math.ceil(d.value) + 2)));
        return;
      }
      if (d.type === "mz-pick" || d.type === "mz-text") {
        setComment("");
        setPending({
          selector: d.selector,
          label: d.label,
          text: d.type === "mz-text" ? d.text : undefined,
          rect: d.rect,
        });
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Push the current annotate mode into the iframe (on toggle + after load).
  const postMode = (on: boolean) => {
    iframeRef.current?.contentWindow?.postMessage({ type: "mz-mode", on }, "*");
  };
  useEffect(() => {
    postMode(annotateMode);
    if (!annotateMode) setPending(null);
  }, [annotateMode]);

  useEffect(() => {
    if (pending !== null) textareaRef.current?.focus();
  }, [pending]);

  const confirm = () => {
    if (pending === null) return;
    const trimmed = comment.trim();
    if (trimmed.length === 0) {
      setPending(null);
      return;
    }
    addAnnotation({
      _tag: "element",
      sourceRef,
      selector: pending.selector,
      label: pending.label,
      ...(pending.text !== undefined ? { text: pending.text } : {}),
      comment: trimmed,
    });
    setPending(null);
    setComment("");
  };

  const copyHtml = () => {
    void navigator.clipboard?.writeText(source).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

  // Place the comment popup just below the selected node, in client coords.
  const popupStyle = (() => {
    if (pending === null) return undefined;
    const frame = iframeRef.current?.getBoundingClientRect();
    if (frame === undefined) return undefined;
    const top = Math.min(
      frame.top + Math.min(pending.rect.bottom, MAX_HEIGHT) + 6,
      window.innerHeight - 180,
    );
    const left = Math.min(
      Math.max(8, frame.left + pending.rect.left),
      window.innerWidth - 320,
    );
    return { top, left, width: 300 } as const;
  })();

  return (
    <div className="markdown-html-artifact my-2 overflow-hidden rounded-lg border border-border/60 bg-card/60">
      <div className="flex items-center gap-2 border-b border-border/40 bg-muted/20 px-2.5 py-1.5">
        <HugeiconsIcon
          icon={CursorMagicSelection02Icon}
          className="size-3.5 text-muted-foreground"
          aria-hidden="true"
        />
        <span className="text-xs font-medium text-muted-foreground">
          Preview
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setAnnotateMode((v) => !v)}
            aria-pressed={annotateMode}
            className={cn(
              "flex h-6 items-center gap-1 rounded-md px-2 text-xs font-medium",
              annotateMode
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "text-muted-foreground hover:bg-background hover:text-foreground",
            )}
          >
            <HugeiconsIcon icon={BubbleChatIcon} className="size-3.5" />
            Annotate
          </button>
          <button
            type="button"
            onClick={copyHtml}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
            aria-label="Copy HTML"
          >
            <HugeiconsIcon
              icon={copied ? Tick01Icon : Copy01Icon}
              className="size-3.5"
            />
          </button>
        </div>
      </div>
      <iframe
        ref={iframeRef}
        title="HTML artifact"
        sandbox="allow-scripts"
        srcDoc={srcDoc}
        onLoad={() => postMode(annotateMode)}
        style={{ height }}
        className="w-full bg-[#0d0d12]"
      />
      {annotateMode ? (
        <div className="border-t border-border/40 bg-muted/10 px-2.5 py-1 text-[11px] text-muted-foreground">
          Click an element or select text in the preview to annotate it.
        </div>
      ) : null}

      {pending !== null && popupStyle !== undefined ? (
        <div
          className="fixed z-50"
          style={popupStyle}
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="w-full rounded-lg border border-border/70 bg-popover p-2 shadow-lg">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <HugeiconsIcon icon={BubbleChatIcon} className="size-3.5" />
              <span className="min-w-0 truncate font-medium text-foreground">
                {pending.text !== undefined
                  ? `"${pending.text.slice(0, 32)}"`
                  : pending.label}
              </span>
            </div>
            <textarea
              ref={textareaRef}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  setPending(null);
                } else if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  confirm();
                }
              }}
              rows={2}
              placeholder="Add a comment…"
              className="max-h-32 min-h-14 w-full resize-y rounded-md bg-background/80 px-2 py-1.5 text-xs leading-relaxed text-foreground outline-none ring-0 placeholder:text-muted-foreground/70 focus:bg-background"
            />
            <div className="mt-1.5 flex items-center justify-end gap-1">
              <button
                type="button"
                onClick={() => setPending(null)}
                className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground"
                aria-label="Cancel annotation"
              >
                <X className="size-3.5" strokeWidth={1.8} />
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={comment.trim().length === 0}
                className="flex h-6 items-center gap-1 rounded-md bg-primary px-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
                aria-label="Add annotation"
              >
                <HugeiconsIcon icon={Tick01Icon} className="size-3.5" />
                Add
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Heuristic: does this string look like a full HTML document we should render
 * as an artifact (vs markdown)? Conservative — only fires on an explicit
 * doctype / `<html>` / `<body>` root so ordinary prose with stray angle
 * brackets keeps rendering as markdown.
 */
export const looksLikeHtmlDocument = (s: string): boolean => {
  const head = s.trimStart().slice(0, 200).toLowerCase();
  return (
    head.startsWith("<!doctype html") ||
    head.startsWith("<html") ||
    head.startsWith("<body")
  );
};

/**
 * Pull a renderable HTML document out of a plan/message body, or `null` if it
 * isn't HTML. Handles both a raw document and a single ```html fenced block
 * (the model may emit either), so a fenced plan renders as an artifact rather
 * than an ugly raw-HTML code block.
 */
export const extractHtmlDoc = (s: string): string | null => {
  const t = s.trim();
  if (looksLikeHtmlDocument(t)) return t;
  const fence = t.match(/```html\s*\n([\s\S]*?)```/i);
  const inner = fence?.[1];
  if (inner !== undefined && looksLikeHtmlDocument(inner)) return inner.trim();
  return null;
};
