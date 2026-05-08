import {
  Brain01Icon,
  CheckListIcon,
  File01Icon,
  GlobeIcon,
  PencilEdit01Icon,
  Robot01Icon,
  SearchIcon,
  TerminalIcon,
  Wrench01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { SessionId } from "@memoize/wire";

import { cn } from "~/lib/utils";

import { usePermissionsStore } from "../store/permissions.ts";
import { FileBadge } from "./file-badge.tsx";
import { MarkdownBody } from "./markdown-body.tsx";
import {
  DiffBody,
  diffStats,
  extractEdits,
  type FileEdit,
} from "./inline-diff.tsx";

type IconHandle = Parameters<typeof HugeiconsIcon>[0]["icon"];

/**
 * Map a tool name to the same Hugeicon used in its expanded ToolRow. Other
 * surfaces (e.g. the turn-summary icon preview) reuse this so the icons
 * stay in lockstep across the timeline.
 */
export const iconForTool = (tool: string): IconHandle => {
  switch (tool) {
    case "Bash":
      return TerminalIcon;
    case "Read":
      return File01Icon;
    case "Edit":
    case "Write":
    case "MultiEdit":
      return PencilEdit01Icon;
    case "Grep":
    case "Glob":
      return SearchIcon;
    case "Task":
    case "Agent":
      return Robot01Icon;
    case "WebFetch":
    case "WebSearch":
      return GlobeIcon;
    case "TodoWrite":
      return CheckListIcon;
    default:
      return Wrench01Icon;
  }
};

interface ToolResult {
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

const asString = (v: unknown): string | null =>
  typeof v === "string" && v.length > 0 ? v : null;

const basename = (p: string): string => {
  const i = p.lastIndexOf("/");
  return i === -1 ? p : p.slice(i + 1);
};

const dirname = (p: string): string => {
  const i = p.lastIndexOf("/");
  return i === -1 ? "" : p.slice(0, i + 1);
};

const truncate = (s: string, max: number): string =>
  s.length > max ? s.slice(0, max - 1) + "…" : s;

/**
 * Coerce a tool_result `output` into displayable text. The Anthropic SDK
 * sometimes returns a string, sometimes an array of content blocks (each
 * with its own `text`); fall back to JSON for anything stranger.
 */
const toResultText = (output: unknown): string => {
  if (typeof output === "string") return output;
  if (output === null || output === undefined) return "";
  if (Array.isArray(output)) {
    const parts: string[] = [];
    for (const block of output) {
      if (block === null || typeof block !== "object") continue;
      const b = block as Record<string, unknown>;
      if (typeof b.text === "string") parts.push(b.text);
    }
    if (parts.length > 0) return parts.join("\n");
  }
  return stringifyJson(output);
};

// First-sentence (or first-line) teaser, with whitespace collapsed and
// hard-capped so a single fat row doesn't blow up the timeline.
const firstSentence = (text: string, hardCap = 160): string => {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length === 0) return "";
  const periodIdx = flat.indexOf(". ");
  const newlineIdx = flat.indexOf("\n");
  const stops = [periodIdx, newlineIdx].filter((i) => i > 0);
  const cut = stops.length > 0 ? Math.min(...stops) + 1 : flat.length;
  return truncate(flat.slice(0, cut).trim(), hardCap);
};

// ---------------------------------------------------------------------------
// Visual primitives
// ---------------------------------------------------------------------------

function InlineCodeChip({ value }: { value: string }) {
  return (
    <span className="ml-1 truncate rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
      {value}
    </span>
  );
}

function InlineTextHint({ value }: { value: string }) {
  return (
    <span className="ml-1 truncate text-muted-foreground italic">
      {value}
    </span>
  );
}

function TerminalBlock({
  command,
  output,
  isError,
}: {
  command?: string;
  output?: string;
  isError?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded bg-zinc-900/70 px-3 py-2 font-mono text-[11px] leading-relaxed overflow-x-auto",
        isError ? "border border-red-500/30" : "",
      )}
    >
      {command !== undefined ? (
        <div className="whitespace-pre-wrap break-words text-foreground/90">
          <span className="select-none text-muted-foreground">$ </span>
          {command}
        </div>
      ) : null}
      {output !== undefined && output.length > 0 ? (
        <div
          className={cn(
            "whitespace-pre-wrap break-words",
            command !== undefined ? "mt-2" : "",
            isError ? "text-red-200" : "text-foreground/80",
          )}
        >
          {output}
        </div>
      ) : null}
    </div>
  );
}

function ErrorPill() {
  return (
    <span className="mr-2 rounded bg-red-500/20 px-1.5 py-0.5 font-medium text-[10px] text-red-300">
      Error
    </span>
  );
}

function FileListBlock({ paths }: { paths: ReadonlyArray<string> }) {
  if (paths.length === 0) {
    return (
      <p className="text-[11px] italic text-muted-foreground">No matches.</p>
    );
  }
  return (
    <ul className="space-y-0.5 font-mono text-[11px]">
      {paths.map((p, i) => {
        const dir = dirname(p);
        const base = basename(p);
        return (
          <li key={i} className="truncate">
            <span className="text-muted-foreground">{dir}</span>
            <span className="text-foreground/90">{base}</span>
          </li>
        );
      })}
    </ul>
  );
}

function MarkdownBlock({ text }: { text: string }) {
  return (
    <div className="prose prose-invert prose-sm max-w-none break-words text-[12px] [&>:first-child]:mt-0 [&>:last-child]:mb-0 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_pre>code]:bg-transparent [&_pre>code]:p-0">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}

function PreBlock({
  text,
  isError,
}: {
  text: string;
  isError?: boolean;
}) {
  return (
    <pre
      className={cn(
        "overflow-x-auto whitespace-pre-wrap break-words rounded bg-zinc-900/70 px-3 py-2 font-mono text-[11px]",
        isError ? "border border-red-500/30 text-red-200" : "text-foreground/80",
      )}
    >
      {text || "(empty)"}
    </pre>
  );
}

// ---------------------------------------------------------------------------
// Result extractors (per tool)
// ---------------------------------------------------------------------------

const splitLines = (s: string): ReadonlyArray<string> => {
  const trimmed = s.trim();
  if (trimmed.length === 0) return [];
  return trimmed.split("\n").map((line) => line.trim()).filter((l) => l.length > 0);
};

// Grep / Glob results are usually one path per line, sometimes followed
// by a header like "Found N files". Filter out obvious headers.
const parseFileList = (output: string): ReadonlyArray<string> => {
  const lines = splitLines(output);
  return lines.filter((l) => !/^found\s+\d+\s+/i.test(l) && !/^no\s+/i.test(l));
};

// ---------------------------------------------------------------------------
// Expandable row primitive (icon ↔ chevron hover swap, click to toggle)
// ---------------------------------------------------------------------------

function ExpandableIconRow({
  icon,
  label,
  trailing,
  body,
  hasContent,
}: {
  icon: IconHandle;
  label: React.ReactNode;
  trailing?: React.ReactNode;
  body: React.ReactNode;
  hasContent: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const Chevron = expanded ? ChevronDown : ChevronRight;
  return (
    <div className="px-4">
      <button
        type="button"
        onClick={() => hasContent && setExpanded((e) => !e)}
        className={cn(
          "group flex w-full items-center gap-2 rounded px-1.5 py-0.5 text-left text-xs",
          hasContent ? "hover:bg-muted/40 cursor-pointer" : "cursor-default",
        )}
      >
        <div className="relative grid size-4 shrink-0 place-items-center">
          <HugeiconsIcon
            icon={icon}
            strokeWidth={2}
            aria-hidden="true"
            className={cn(
              "col-start-1 row-start-1 size-3.5 text-muted-foreground transition-opacity duration-150 ease-out",
              hasContent ? "group-hover:opacity-0" : "",
              "motion-reduce:transition-none",
            )}
          />
          {hasContent ? (
            <Chevron
              aria-hidden="true"
              className={cn(
                "col-start-1 row-start-1 size-3.5 text-muted-foreground opacity-0 transition-opacity duration-150 ease-out",
                "group-hover:opacity-100 motion-reduce:transition-none",
              )}
            />
          ) : null}
        </div>
        <span className="font-medium text-foreground/90 shrink-0">{label}</span>
        {trailing !== undefined ? (
          <span className="min-w-0 flex-1 truncate flex items-center">
            {trailing}
          </span>
        ) : null}
      </button>
      {expanded && hasContent ? (
        <div className="ml-7 mt-1 max-w-2xl space-y-2 overflow-hidden border-l border-border/60 pl-3 pr-1">
          {body}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-tool views
// ---------------------------------------------------------------------------

interface ToolView {
  readonly icon: IconHandle;
  readonly label: string;
  readonly trailing?: React.ReactNode;
  readonly inputPanel?: React.ReactNode;
  readonly resultPanel?: (result: ToolResult) => React.ReactNode;
  readonly fallbackBody?: React.ReactNode;
}

// Line-count derived from a tool result's textual output. Used by Read /
// Grep / Glob to summarise "how much did this return?" in the collapsed row.
const lineCountOf = (output: unknown): number => {
  const text = toResultText(output);
  if (text.length === 0) return 0;
  return text.split("\n").length;
};

const buildToolView = (
  tool: string,
  input: unknown,
  result: ToolResult | undefined,
): ToolView => {
  const obj =
    input !== null && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};

  switch (tool) {
    case "Bash": {
      const cmd = asString(obj.command);
      const desc = asString(obj.description);
      return {
        icon: TerminalIcon,
        label: desc ?? "Bash",
        trailing:
          cmd !== null ? <InlineCodeChip value={truncate(cmd, 120)} /> : undefined,
        inputPanel:
          cmd !== null ? <TerminalBlock command={cmd} /> : undefined,
        resultPanel: (result) => (
          <TerminalBlock
            output={toResultText(result.output) || "(no output)"}
            isError={result.isError}
          />
        ),
        fallbackBody:
          cmd === null ? (
            <PreBlock text={stringifyJson(input)} />
          ) : undefined,
      };
    }

    case "Read": {
      const path = asString(obj.file_path);
      const offset = typeof obj.offset === "number" ? obj.offset : null;
      const limit = typeof obj.limit === "number" ? obj.limit : null;
      const range =
        offset !== null || limit !== null
          ? `lines ${offset ?? 1}–${(offset ?? 1) + (limit ?? 0) - 1}`
          : null;
      // Once the result is in we can show "N lines" — until then, a "…"
      // placeholder so the row's geometry doesn't shift when the result
      // arrives a frame later.
      const lines = result !== undefined ? lineCountOf(result.output) : null;
      const linesHint =
        lines !== null
          ? lines === 0
            ? "(empty)"
            : `${lines} line${lines === 1 ? "" : "s"}`
          : "…";
      return {
        icon: File01Icon,
        label: "Read",
        trailing:
          path !== null ? (
            <span className="flex items-center gap-2">
              <span className="text-muted-foreground">{linesHint}</span>
              <FileBadge path={path} />
            </span>
          ) : undefined,
        inputPanel:
          path !== null ? (
            <p className="font-mono text-[11px] text-muted-foreground break-all">
              {path}
              {range !== null ? ` · ${range}` : null}
            </p>
          ) : undefined,
        resultPanel: (result) => {
          const text = toResultText(result.output);
          const lineCount = text.length === 0 ? 0 : text.split("\n").length;
          return (
            <div className="space-y-1">
              <p className="text-[11px] text-muted-foreground">
                {lineCount} line{lineCount === 1 ? "" : "s"}
              </p>
              <PreBlock
                text={truncate(text, 4000)}
                isError={result.isError}
              />
            </div>
          );
        },
      };
    }

    case "Edit":
    case "Write":
    case "MultiEdit": {
      const path = asString(obj.file_path);
      const edits = extractEdits(tool, input);
      const label =
        tool === "Write"
          ? "Write"
          : tool === "MultiEdit"
            ? `MultiEdit (${edits.length})`
            : "Edit";
      const stats = edits.length > 0 ? diffStats(edits) : null;
      return {
        icon: PencilEdit01Icon,
        label,
        trailing:
          path !== null ? (
            <span className="flex items-center gap-2 tabular-nums">
              <FileBadge path={path} />
              {stats !== null && stats.added > 0 ? (
                <span className="text-emerald-400">+{stats.added}</span>
              ) : null}
              {stats !== null && stats.removed > 0 ? (
                <span className="text-red-400">-{stats.removed}</span>
              ) : null}
            </span>
          ) : undefined,
        fallbackBody:
          edits.length > 0 ? (
            <div className="overflow-hidden rounded border border-border/60">
              {edits.map((edit, i) => (
                <DiffBody
                  key={i}
                  edit={edit as FileEdit}
                  showHeader={edits.length > 1}
                />
              ))}
            </div>
          ) : (
            <PreBlock text={stringifyJson(input)} />
          ),
        resultPanel: (result) =>
          result.isError ? (
            <PreBlock text={toResultText(result.output)} isError />
          ) : null,
      };
    }

    case "Grep": {
      const pattern = asString(obj.pattern);
      const path = asString(obj.path);
      const glob = asString(obj.glob);
      const type = asString(obj.type);
      const where = path ?? glob ?? type;
      const matches =
        result !== undefined && !result.isError
          ? parseFileList(toResultText(result.output)).length
          : null;
      const matchesHint =
        matches !== null
          ? matches === 0
            ? "no matches"
            : `${matches} match${matches === 1 ? "" : "es"}`
          : null;
      return {
        icon: SearchIcon,
        label: "Grep",
        trailing:
          pattern !== null ? (
            <>
              <InlineCodeChip value={pattern} />
              {where !== null ? <InlineTextHint value={`in ${where}`} /> : null}
              {matchesHint !== null ? (
                <InlineTextHint value={`· ${matchesHint}`} />
              ) : null}
            </>
          ) : undefined,
        inputPanel:
          pattern !== null ? (
            <div className="text-[11px] text-muted-foreground space-y-0.5">
              <div>
                pattern <span className="font-mono text-foreground/90">{pattern}</span>
              </div>
              {where !== null ? (
                <div>
                  scope <span className="font-mono text-foreground/90">{where}</span>
                </div>
              ) : null}
            </div>
          ) : undefined,
        resultPanel: (result) => {
          const text = toResultText(result.output);
          if (result.isError) return <PreBlock text={text} isError />;
          const paths = parseFileList(text);
          return paths.length > 0 ? (
            <FileListBlock paths={paths} />
          ) : (
            <PreBlock text={text || "No matches."} />
          );
        },
      };
    }

    case "Glob": {
      const pattern = asString(obj.pattern);
      const matches =
        result !== undefined && !result.isError
          ? parseFileList(toResultText(result.output)).length
          : null;
      const matchesHint =
        matches !== null
          ? matches === 0
            ? "no matches"
            : `${matches} file${matches === 1 ? "" : "s"}`
          : null;
      return {
        icon: SearchIcon,
        label: "Glob",
        trailing:
          pattern !== null ? (
            <>
              <InlineCodeChip value={pattern} />
              {matchesHint !== null ? (
                <InlineTextHint value={`· ${matchesHint}`} />
              ) : null}
            </>
          ) : undefined,
        resultPanel: (result) => {
          const text = toResultText(result.output);
          if (result.isError) return <PreBlock text={text} isError />;
          const paths = parseFileList(text);
          return paths.length > 0 ? (
            <FileListBlock paths={paths} />
          ) : (
            <PreBlock text={text || "No matches."} />
          );
        },
      };
    }

    case "Task":
    case "Agent": {
      const desc = asString(obj.description) ?? asString(obj.subagent_type);
      const prompt = asString(obj.prompt);
      return {
        icon: Robot01Icon,
        label: "Agent",
        trailing: desc !== null ? <InlineTextHint value={desc} /> : undefined,
        inputPanel:
          prompt !== null ? (
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Prompt
              </p>
              <PreBlock text={prompt} />
            </div>
          ) : undefined,
        resultPanel: (result) => {
          const text = toResultText(result.output);
          if (result.isError) return <PreBlock text={text} isError />;
          return (
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Reply
              </p>
              <MarkdownBlock text={text || "(empty)"} />
            </div>
          );
        },
      };
    }

    case "WebFetch": {
      const url = asString(obj.url);
      return {
        icon: GlobeIcon,
        label: "WebFetch",
        trailing: url !== null ? <InlineCodeChip value={url} /> : undefined,
        resultPanel: (result) => (
          <PreBlock
            text={truncate(toResultText(result.output), 4000)}
            isError={result.isError}
          />
        ),
      };
    }

    case "WebSearch": {
      const q = asString(obj.query);
      return {
        icon: GlobeIcon,
        label: "WebSearch",
        trailing: q !== null ? <InlineCodeChip value={q} /> : undefined,
        resultPanel: (result) => (
          <PreBlock
            text={truncate(toResultText(result.output), 4000)}
            isError={result.isError}
          />
        ),
      };
    }

    case "TodoWrite": {
      const todos = Array.isArray(obj.todos) ? obj.todos : null;
      return {
        icon: CheckListIcon,
        label: "TodoWrite",
        trailing:
          todos !== null ? (
            <InlineTextHint value={`${todos.length} todos`} />
          ) : undefined,
        fallbackBody:
          todos !== null ? (
            <ul className="space-y-0.5 text-[11px]">
              {todos.map((t, i) => {
                if (t === null || typeof t !== "object")
                  return <li key={i}>{stringifyJson(t)}</li>;
                const r = t as Record<string, unknown>;
                const content = asString(r.content) ?? asString(r.activeForm) ?? "";
                const status = asString(r.status) ?? "";
                return (
                  <li key={i} className="font-mono">
                    <span className="text-muted-foreground">[{status}]</span>{" "}
                    {content}
                  </li>
                );
              })}
            </ul>
          ) : (
            <PreBlock text={stringifyJson(input)} />
          ),
      };
    }

    default: {
      return {
        icon: Wrench01Icon,
        label: tool,
        fallbackBody: <PreBlock text={stringifyJson(input)} />,
        resultPanel: (result) => (
          <PreBlock
            text={toResultText(result.output)}
            isError={result.isError}
          />
        ),
      };
    }
  }
};

/**
 * Plan card for the SDK's `ExitPlanMode` tool. The card itself owns
 * approval — finds the matching pending `permission.request` for this
 * session and resolves it on click. Approving lets the SDK run
 * ExitPlanMode, which auto-flips out of plan mode; rejecting keeps the
 * agent in plan mode to iterate.
 *
 * Visual states (kept minimal — no flashy fills, just a subtle border):
 *   - **Pending** — result undefined; show Approve / Reject.
 *   - **Approved** — result with `isError: false`; small "Approved" tag.
 *   - **Rejected** — result with `isError: true`; small "Rejected" tag.
 */
export function ExitPlanModeRow({
  input,
  result,
  sessionId,
}: {
  input: unknown;
  result?: ToolResult;
  sessionId?: SessionId;
}) {
  const plan =
    typeof input === "object" && input !== null && "plan" in input
      ? typeof (input as { plan?: unknown }).plan === "string"
        ? ((input as { plan: string }).plan as string)
        : null
      : null;

  const status: "pending" | "approved" | "rejected" =
    result === undefined
      ? "pending"
      : result.isError
        ? "rejected"
        : "approved";

  // Find the open permission request for this session's ExitPlanMode.
  // There should be at most one in-flight at a time.
  const pendingRequest = usePermissionsStore((s) => {
    if (sessionId === undefined) return null;
    for (const req of Object.values(s.requestsById)) {
      if (req.sessionId !== sessionId) continue;
      if (req.kind._tag !== "Other") continue;
      if (req.kind.tool !== "ExitPlanMode") continue;
      return req;
    }
    return null;
  });
  const decide = usePermissionsStore((s) => s.decide);

  return (
    <div className="py-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <HugeiconsIcon icon={CheckListIcon} size={14} strokeWidth={2} />
          <span>Plan</span>
        </div>
        {status !== "pending" ? (
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
              status === "approved"
                ? "text-emerald-500/90"
                : "text-muted-foreground",
            )}
          >
            {status === "approved" ? "Approved" : "Rejected"}
          </span>
        ) : null}
      </div>
      {plan === null ? (
        <p className="text-sm italic text-muted-foreground">
          (No plan body.)
        </p>
      ) : (
        <MarkdownBody>{plan}</MarkdownBody>
      )}
      {status === "pending" && pendingRequest !== null ? (
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() =>
              void decide(pendingRequest.id, { _tag: "Deny" })
            }
            className="rounded-md px-3 py-1 text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={() =>
              void decide(pendingRequest.id, { _tag: "AllowOnce" })
            }
            className="rounded-md bg-foreground px-3 py-1 text-xs font-medium text-background hover:opacity-90"
          >
            Approve
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function ToolRow({
  tool,
  input,
  result,
}: {
  tool: string;
  input: unknown;
  result?: ToolResult;
}) {
  const view = buildToolView(tool, input, result);

  const sections: React.ReactNode[] = [];
  if (view.inputPanel !== undefined) {
    sections.push(<div key="input">{view.inputPanel}</div>);
  }
  if (view.fallbackBody !== undefined) {
    sections.push(<div key="fallback">{view.fallbackBody}</div>);
  }
  if (result !== undefined && view.resultPanel !== undefined) {
    const rendered = view.resultPanel(result);
    if (rendered !== null) {
      sections.push(
        <div key="result">
          {result.isError ? (
            <div className="mb-1 flex items-center">
              <ErrorPill />
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Result
              </span>
            </div>
          ) : (
            <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              Result
            </p>
          )}
          {rendered}
        </div>,
      );
    }
  }

  return (
    <ExpandableIconRow
      icon={view.icon}
      label={view.label}
      trailing={view.trailing}
      hasContent={sections.length > 0}
      body={sections.length > 0 ? sections : null}
    />
  );
}

export function ThinkingRow({
  text,
  redacted,
}: {
  text: string;
  redacted: boolean;
}) {
  // Three states:
  // 1. redacted — model thought but content is policy-hidden (rare;
  //    `redacted_thinking` content blocks).
  // 2. empty text — Anthropic's SDK / CLI receives the signature but
  //    strips every `thinking_delta` chunk before forwarding to us. The
  //    model did think, we just never see the words. We render a row
  //    anyway so the timeline accurately reflects what happened.
  // 3. plain text — render as markdown.
  const isEmpty = !redacted && text.length === 0;
  const teaser = redacted
    ? "(redacted)"
    : isEmpty
      ? "(content not exposed by SDK)"
      : firstSentence(text);
  const body = redacted ? (
    <p className="whitespace-pre-wrap text-[11px] italic leading-relaxed text-muted-foreground/70">
      Thought content was redacted by the model.
    </p>
  ) : isEmpty ? (
    <p className="whitespace-pre-wrap text-[11px] italic leading-relaxed text-muted-foreground/70">
      The model produced a thinking block (the SDK forwarded its signed
      receipt) but the underlying text was filtered out by Anthropic's
      agent SDK before it reached us. We can&apos;t expose the actual
      thoughts without bypassing the official SDK.
    </p>
  ) : (
    <MarkdownBlock text={text} />
  );
  return (
    <ExpandableIconRow
      icon={Brain01Icon}
      label="Thinking"
      trailing={<InlineTextHint value={teaser} />}
      hasContent
      body={body}
    />
  );
}
