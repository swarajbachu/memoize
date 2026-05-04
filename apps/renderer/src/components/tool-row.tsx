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

import { cn } from "~/lib/utils";

import { DiffBody, extractEdits, type FileEdit } from "./inline-diff.tsx";

type IconHandle = Parameters<typeof HugeiconsIcon>[0]["icon"];

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

const truncate = (s: string, max: number): string =>
  s.length > max ? s.slice(0, max - 1) + "…" : s;

const JsonBody = ({ value }: { value: unknown }) => (
  <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] text-muted-foreground">
    {stringifyJson(value)}
  </pre>
);

const editsBody = (edits: ReadonlyArray<FileEdit>): React.ReactNode => (
  <div className="overflow-hidden rounded border border-border/60">
    {edits.map((edit, i) => (
      <DiffBody key={i} edit={edit} showHeader={edits.length > 1} />
    ))}
  </div>
);

/**
 * Single-line collapsible row used by tool calls and thinking blocks. The
 * leading slot is a fixed-size grid cell that holds the contextual icon
 * (idle) and a chevron (hover) in the same cell — same swap pattern the
 * project sidebar uses for avatar↔chevron and session row uses for
 * branch↔archive.
 */
function ExpandableIconRow({
  icon,
  label,
  summary,
  body,
  labelClassName,
  summaryClassName,
}: {
  icon: IconHandle;
  label: string;
  summary: string | null;
  body: React.ReactNode;
  labelClassName?: string;
  summaryClassName?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const Chevron = expanded ? ChevronDown : ChevronRight;
  return (
    <div className="px-4">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="group flex w-full items-center gap-2 rounded px-1.5 py-0.5 text-left text-xs hover:bg-muted/40"
      >
        <div className="relative grid size-4 shrink-0 place-items-center">
          <HugeiconsIcon
            icon={icon}
            strokeWidth={2}
            aria-hidden="true"
            className={cn(
              "col-start-1 row-start-1 size-3.5 text-muted-foreground transition-opacity duration-150 ease-out",
              "group-hover:opacity-0 motion-reduce:transition-none",
            )}
          />
          <Chevron
            aria-hidden="true"
            className={cn(
              "col-start-1 row-start-1 size-3.5 text-muted-foreground opacity-0 transition-opacity duration-150 ease-out",
              "group-hover:opacity-100 motion-reduce:transition-none",
            )}
          />
        </div>
        <span className={cn("font-medium text-foreground/90", labelClassName)}>
          {label}
        </span>
        {summary !== null ? (
          <span className={cn("truncate text-muted-foreground", summaryClassName)}>
            {summary}
          </span>
        ) : null}
      </button>
      {expanded ? (
        <div className="ml-7 mt-1 border-l border-border/60 pl-3">{body}</div>
      ) : null}
    </div>
  );
}

interface ToolView {
  readonly icon: IconHandle;
  readonly label: string;
  readonly summary: string | null;
  readonly body: React.ReactNode;
}

const buildToolView = (tool: string, input: unknown): ToolView => {
  const obj =
    input !== null && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};

  switch (tool) {
    case "Read": {
      const path = asString(obj.file_path);
      return {
        icon: File01Icon,
        label: "Read",
        summary: path !== null ? basename(path) : null,
        body: <JsonBody value={input} />,
      };
    }

    case "Bash": {
      const cmd = asString(obj.command);
      const desc = asString(obj.description);
      return {
        icon: TerminalIcon,
        label: "Bash",
        summary: desc ?? (cmd !== null ? truncate(cmd, 80) : null),
        body:
          cmd !== null ? (
            <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] text-foreground/80">
              {cmd}
            </pre>
          ) : (
            <JsonBody value={input} />
          ),
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
      return {
        icon: PencilEdit01Icon,
        label,
        summary: path !== null ? basename(path) : null,
        body:
          edits.length > 0 ? editsBody(edits) : <JsonBody value={input} />,
      };
    }

    case "Grep": {
      const pattern = asString(obj.pattern);
      const path = asString(obj.path);
      const glob = asString(obj.glob);
      const where = path ?? glob;
      return {
        icon: SearchIcon,
        label: "Grep",
        summary:
          pattern !== null
            ? where !== null
              ? `${pattern} in ${where}`
              : pattern
            : null,
        body: <JsonBody value={input} />,
      };
    }

    case "Glob": {
      const pattern = asString(obj.pattern);
      return {
        icon: SearchIcon,
        label: "Glob",
        summary: pattern,
        body: <JsonBody value={input} />,
      };
    }

    case "Task":
    case "Agent": {
      const desc = asString(obj.description) ?? asString(obj.subagent_type);
      return {
        icon: Robot01Icon,
        label: "Agent",
        summary: desc,
        body: <JsonBody value={input} />,
      };
    }

    case "WebFetch": {
      const url = asString(obj.url);
      return {
        icon: GlobeIcon,
        label: "WebFetch",
        summary: url,
        body: <JsonBody value={input} />,
      };
    }

    case "WebSearch": {
      const q = asString(obj.query);
      return {
        icon: GlobeIcon,
        label: "WebSearch",
        summary: q,
        body: <JsonBody value={input} />,
      };
    }

    case "TodoWrite": {
      const todos = Array.isArray(obj.todos) ? obj.todos.length : null;
      return {
        icon: CheckListIcon,
        label: "TodoWrite",
        summary: todos !== null ? `${todos} todos` : null,
        body: <JsonBody value={input} />,
      };
    }

    default: {
      return {
        icon: Wrench01Icon,
        label: tool,
        summary: null,
        body: <JsonBody value={input} />,
      };
    }
  }
};

export function ToolRow({ tool, input }: { tool: string; input: unknown }) {
  const view = buildToolView(tool, input);
  return (
    <ExpandableIconRow
      icon={view.icon}
      label={view.label}
      summary={view.summary}
      body={view.body}
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
  const summary = redacted
    ? "(redacted)"
    : text.length > 0
      ? truncate(text.replace(/\s+/g, " ").trim(), 100)
      : null;
  const body = redacted ? (
    <p className="whitespace-pre-wrap text-[11px] italic leading-relaxed text-muted-foreground/70">
      Thought content was redacted by the model.
    </p>
  ) : (
    <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground">
      {text}
    </p>
  );
  return (
    <ExpandableIconRow
      icon={Brain01Icon}
      label="Thinking"
      summary={summary}
      body={body}
      summaryClassName="italic"
    />
  );
}
