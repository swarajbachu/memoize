import { AlertCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { Message } from "@forkzero/wire";

import { cn } from "~/lib/utils";

import { ThinkingRow, ToolRow } from "./tool-row.tsx";

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
    case "thinking":
      return (
        <ThinkingRow
          text={message.content.text}
          redacted={message.content.redacted}
        />
      );
    case "tool_use":
      return (
        <ToolRow tool={message.content.tool} input={message.content.input} />
      );
    case "tool_result":
      return message.content.isError ? (
        <ToolErrorRow output={message.content.output} />
      ) : null;
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

function ToolErrorRow({ output }: { output: unknown }) {
  const [expanded, setExpanded] = useState(false);
  const Chevron = expanded ? ChevronDown : ChevronRight;
  const text = typeof output === "string" ? output : stringifyJson(output);
  const firstLine = text.split("\n", 1)[0] ?? "";
  return (
    <div className="px-4">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="group flex w-full items-center gap-2 rounded px-1.5 py-0.5 text-left text-xs hover:bg-red-500/10"
      >
        <div className="relative grid size-4 shrink-0 place-items-center">
          <HugeiconsIcon
            icon={AlertCircleIcon}
            strokeWidth={2}
            aria-hidden="true"
            className={cn(
              "col-start-1 row-start-1 size-3.5 text-red-400 transition-opacity duration-150 ease-out",
              "group-hover:opacity-0 motion-reduce:transition-none",
            )}
          />
          <Chevron
            aria-hidden="true"
            className={cn(
              "col-start-1 row-start-1 size-3.5 text-red-400 opacity-0 transition-opacity duration-150 ease-out",
              "group-hover:opacity-100 motion-reduce:transition-none",
            )}
          />
        </div>
        <span className="font-medium text-red-300">Error</span>
        <span className="truncate text-red-200/80">{firstLine}</span>
      </button>
      {expanded ? (
        <div className="ml-7 mt-1 border-l border-red-500/30 pl-3">
          <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] text-red-200">
            {text || "(empty)"}
          </pre>
        </div>
      ) : null}
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
