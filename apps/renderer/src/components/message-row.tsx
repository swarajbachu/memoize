import { ChevronDown, ChevronRight, Wrench } from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { Message } from "@forkzero/wire";

const stringifyJson = (value: unknown): string => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

/**
 * Render a single chat row. Variants are dispatched on `content._tag` rather
 * than `role` because role collapses tool_use and assistant text into one
 * bucket, but their visual treatment differs.
 */
export function MessageRow({ message }: { message: Message }) {
  switch (message.content._tag) {
    case "user":
      return <UserBubble text={message.content.text} />;
    case "assistant":
      return <AssistantBubble text={message.content.text} />;
    case "tool_use":
      return (
        <ToolUseBubble
          tool={message.content.tool}
          input={message.content.input}
        />
      );
    case "tool_result":
      return (
        <ToolResultBubble
          output={message.content.output}
          isError={message.content.isError}
        />
      );
    case "error":
      return <ErrorBubble text={message.content.message} />;
  }
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end px-4 py-2">
      <div className="max-w-[80%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
        {text}
      </div>
    </div>
  );
}

function AssistantBubble({ text }: { text: string }) {
  return (
    <div className="px-4 py-2">
      <div className="max-w-[88%] text-sm leading-relaxed">
        <div className="prose prose-invert prose-sm max-w-none break-words [&>:first-child]:mt-0 [&>:last-child]:mb-0 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_pre>code]:bg-transparent [&_pre>code]:p-0">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

function ToolUseBubble({ tool, input }: { tool: string; input: unknown }) {
  const [expanded, setExpanded] = useState(false);
  const Chevron = expanded ? ChevronDown : ChevronRight;
  return (
    <div className="px-4 py-1">
      <div className="max-w-[88%] rounded-md border border-border bg-muted/40 text-xs">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left hover:bg-muted/60"
        >
          <Chevron className="size-3 shrink-0 text-muted-foreground" />
          <Wrench className="size-3 shrink-0 text-amber-400" />
          <span className="font-mono text-amber-200">{tool}</span>
          <span className="ml-1 text-muted-foreground">tool call</span>
        </button>
        {expanded && (
          <pre className="overflow-x-auto border-t border-border/60 px-2 py-2 font-mono text-[11px] text-muted-foreground">
            {stringifyJson(input)}
          </pre>
        )}
      </div>
    </div>
  );
}

function ToolResultBubble({
  output,
  isError,
}: {
  output: unknown;
  isError: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const Chevron = expanded ? ChevronDown : ChevronRight;
  const text =
    typeof output === "string" ? output : stringifyJson(output);
  return (
    <div className="px-4 py-1">
      <div
        className={`max-w-[88%] rounded-md border text-xs ${
          isError
            ? "border-red-500/40 bg-red-500/10"
            : "border-border bg-muted/40"
        }`}
      >
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left hover:bg-muted/60"
        >
          <Chevron className="size-3 shrink-0 text-muted-foreground" />
          <span className={isError ? "text-red-300" : "text-emerald-300"}>
            {isError ? "tool error" : "tool result"}
          </span>
        </button>
        {expanded && (
          <pre
            className={`overflow-x-auto border-t px-2 py-2 font-mono text-[11px] ${
              isError
                ? "border-red-500/30 text-red-200"
                : "border-border/60 text-muted-foreground"
            }`}
          >
            {text || "(empty)"}
          </pre>
        )}
      </div>
    </div>
  );
}

function ErrorBubble({ text }: { text: string }) {
  return (
    <div className="px-4 py-2">
      <div className="max-w-[88%] rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
        {text}
      </div>
    </div>
  );
}
