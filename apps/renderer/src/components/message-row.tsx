import { AlertCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type {
  AgentItemId,
  AttachmentRef,
  FileRef,
  Message,
  SkillRef,
} from "@forkzero/wire";

import { getFileIconUrl } from "~/lib/icons/material-icons";
import { cn } from "~/lib/utils";

import { ThinkingRow, ToolRow } from "./tool-row.tsx";

export interface ToolResultRecord {
  readonly output: unknown;
  readonly isError: boolean;
}

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
 *
 * `resultsByItemId` lets `tool_use` rows render their paired `tool_result`
 * inline. Standalone `tool_result` rows are suppressed when they pair with
 * a tool_use; only orphan errors fall through to the standalone error row.
 */
export function MessageRow({
  message,
  resultsByItemId,
}: {
  message: Message;
  resultsByItemId: ReadonlyMap<AgentItemId, ToolResultRecord>;
}) {
  switch (message.content._tag) {
    case "user":
      return <UserBubble text={message.content.text} />;
    case "user_rich":
      return (
        <UserBubble
          text={message.content.text}
          attachments={message.content.attachments}
          fileRefs={message.content.fileRefs}
          skillRefs={message.content.skillRefs}
        />
      );
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
        <ToolRow
          tool={message.content.tool}
          input={message.content.input}
          result={resultsByItemId.get(message.content.itemId)}
        />
      );
    case "tool_result": {
      // Suppress paired results — the matching ToolRow renders them inline.
      // Only orphan errors (no tool_use found, e.g. driver dropped the use
      // event) surface as a standalone error row.
      const paired = resultsByItemId.has(message.content.itemId);
      if (paired) return null;
      return message.content.isError ? (
        <ToolErrorRow output={message.content.output} />
      ) : null;
    }
    case "error":
      return <ErrorBubble text={message.content.message} />;
  }
}

/**
 * Strip the inline chip tokens (`[image:<id>]`, `@<path>`, `/<skill>`) from
 * text we render in the user bubble. The chips are surfaced as visual
 * thumbnails / chips below the bubble, so showing the raw token in-line is
 * just noise. Tokens for chip kinds the row didn't receive (legacy `user`
 * content, copy-pasted text) pass through unchanged.
 */
const stripChipTokens = (
  text: string,
  attachments: ReadonlyArray<AttachmentRef>,
  fileRefs: ReadonlyArray<FileRef>,
  skillRefs: ReadonlyArray<SkillRef>,
): string => {
  let out = text;
  for (const a of attachments) {
    out = out.replaceAll(`[image:${a.id}]`, "");
  }
  // Attachments uploaded but submitted while still holding the renderer-side
  // temp id — we strip them defensively too so the bubble doesn't show
  // `[image:pending-xxx]`.
  out = out.replace(/\[image:pending-[a-z0-9]+\]/gi, "");
  for (const f of fileRefs) {
    out = out.replaceAll(`@${f.relPath}`, f.relPath);
  }
  for (const s of skillRefs) {
    out = out.replaceAll(`/${s.name}`, `/${s.name}`);
  }
  return out.replace(/[ \t]{2,}/g, " ").trim();
};

function UserBubble({
  text,
  attachments,
  fileRefs,
  skillRefs,
}: {
  text: string;
  attachments?: ReadonlyArray<AttachmentRef>;
  fileRefs?: ReadonlyArray<FileRef>;
  skillRefs?: ReadonlyArray<SkillRef>;
}) {
  const hasChips =
    (attachments !== undefined && attachments.length > 0) ||
    (fileRefs !== undefined && fileRefs.length > 0) ||
    (skillRefs !== undefined && skillRefs.length > 0);
  const display = hasChips
    ? stripChipTokens(text, attachments ?? [], fileRefs ?? [], skillRefs ?? [])
    : text;
  const truncate = (name: string): string =>
    name.length > 28 ? `${name.slice(0, 25)}...` : name;
  return (
    <div className="flex justify-end px-4 py-2">
      <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-user-bubble px-3 py-2 text-sm text-user-bubble-foreground">
        {hasChips ? (
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            {(attachments ?? []).map((a) => {
              const isImage = a.mimeType.startsWith("image/");
              const iconUrl = isImage ? null : getFileIconUrl(a.originalName);
              return (
                <a
                  key={a.id}
                  href={`forkzero://attachments/${a.id}`}
                  target="_blank"
                  rel="noreferrer"
                  title={a.originalName}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/40 px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted/60"
                >
                  {isImage ? (
                    <img
                      src={`forkzero://attachments/${a.id}`}
                      alt=""
                      className="size-4 rounded object-cover"
                    />
                  ) : iconUrl !== null ? (
                    <img src={iconUrl} alt="" className="size-4" />
                  ) : null}
                  <span className="truncate">{truncate(a.originalName)}</span>
                </a>
              );
            })}
            {(fileRefs ?? []).map((f) => (
              <span
                key={f.relPath}
                className="inline-flex items-center rounded-md border border-border/60 bg-muted/40 px-1.5 py-0.5 text-xs text-muted-foreground"
              >
                @{f.relPath}
              </span>
            ))}
            {(skillRefs ?? []).map((s) => (
              <span
                key={s.name}
                className="inline-flex items-center rounded-md border border-border/60 bg-muted/40 px-1.5 py-0.5 text-xs text-muted-foreground"
              >
                /{s.name}
              </span>
            ))}
          </div>
        ) : null}
        {display.length > 0 ? (
          <div className="whitespace-pre-wrap break-words">{display}</div>
        ) : null}
      </div>
    </div>
  );
}

function AssistantBubble({ text }: { text: string }) {
  return (
    <div className="px-4 py-2">
      <div className="fz-prose max-w-[88%]">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
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
