import { useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  Hammer,
  MessageSquare,
  Shield,
  Sparkles,
  X,
} from "lucide-react";

import type { AgentEvent } from "@forkzero/wire";

const formatJson = (value: unknown): string => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

export function AgentEventRow({ event }: { event: AgentEvent }) {
  const [expanded, setExpanded] = useState(false);

  if (event._tag === "Started") {
    return (
      <Row icon={<Sparkles className="size-3.5 text-muted-foreground" />}>
        <span className="text-muted-foreground">
          Session started · {event.providerId} · {event.mode}
        </span>
      </Row>
    );
  }

  if (event._tag === "AssistantMessage") {
    return (
      <Row icon={<MessageSquare className="size-3.5 text-blue-400" />}>
        <p className="whitespace-pre-wrap text-sm text-foreground">
          {event.text}
        </p>
      </Row>
    );
  }

  if (event._tag === "ToolUse") {
    return (
      <Row
        icon={<Hammer className="size-3.5 text-amber-400" />}
        toggle={() => setExpanded((v) => !v)}
        chevron={
          expanded ? (
            <ChevronDown className="size-3" />
          ) : (
            <ChevronRight className="size-3" />
          )
        }
      >
        <span className="font-mono text-xs text-foreground">{event.tool}</span>
        {expanded && (
          <pre className="mt-1 overflow-x-auto rounded bg-muted/50 p-2 text-[11px] text-muted-foreground">
            {formatJson(event.input)}
          </pre>
        )}
      </Row>
    );
  }

  if (event._tag === "ToolResult") {
    const Icon = event.isError ? X : Check;
    const color = event.isError ? "text-red-400" : "text-emerald-400";
    return (
      <Row
        icon={<Icon className={`size-3.5 ${color}`} />}
        toggle={() => setExpanded((v) => !v)}
        chevron={
          expanded ? (
            <ChevronDown className="size-3" />
          ) : (
            <ChevronRight className="size-3" />
          )
        }
      >
        <span className="text-xs text-muted-foreground">
          {event.isError ? "tool error" : "tool result"}
        </span>
        {expanded && (
          <pre className="mt-1 overflow-x-auto rounded bg-muted/50 p-2 text-[11px] text-muted-foreground">
            {formatJson(event.output)}
          </pre>
        )}
      </Row>
    );
  }

  if (event._tag === "PermissionRequest") {
    return (
      <Row icon={<Shield className="size-3.5 text-yellow-400" />}>
        <span className="text-xs text-muted-foreground">
          Permission requested for <span className="font-mono">{event.kind}</span>
          {" "}— auto-denied. Phase 3 will let you allow this.
        </span>
      </Row>
    );
  }

  if (event._tag === "Completed") {
    return (
      <Row icon={<Check className="size-3.5 text-muted-foreground" />}>
        <span className="text-xs text-muted-foreground">
          Completed · {event.reason}
        </span>
      </Row>
    );
  }

  if (event._tag === "Error") {
    return (
      <Row icon={<AlertCircle className="size-3.5 text-red-400" />}>
        <span className="text-xs text-red-400">{event.message}</span>
      </Row>
    );
  }

  return null;
}

function Row({
  icon,
  children,
  toggle,
  chevron,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  toggle?: () => void;
  chevron?: React.ReactNode;
}) {
  return (
    <div
      className={`flex gap-2 rounded px-2 py-1.5 ${
        toggle !== undefined ? "cursor-pointer hover:bg-muted/40" : ""
      }`}
      onClick={toggle}
    >
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">{children}</div>
      {chevron !== undefined && (
        <div className="mt-0.5 shrink-0 text-muted-foreground">{chevron}</div>
      )}
    </div>
  );
}
