import { Eraser, FileText, Gauge, HelpCircle, Layers } from "lucide-react";
import type { ComponentType } from "react";

export interface BuiltinCommand {
  /** The slash token without the leading `/`. */
  readonly name: string;
  readonly description: string;
  readonly Icon: ComponentType<{ className?: string }>;
  /** Token the command pops as a single line, used to detect at submit time. */
  readonly token: string;
}

/**
 * Built-in slash commands. These execute client-side at send time without a
 * server roundtrip — see chat-composer.tsx's submit pipeline for the
 * dispatch.
 */
export const BUILTIN_COMMANDS: readonly BuiltinCommand[] = [
  {
    name: "clear",
    description: "Clear the composer and the per-session queue.",
    Icon: Eraser,
    token: "/clear",
  },
  {
    name: "new",
    description: "Start a new session in the current project.",
    Icon: FileText,
    token: "/new",
  },
  {
    name: "model",
    description: "Switch the session model. Usage: /model <id>",
    Icon: Layers,
    token: "/model",
  },
  {
    name: "mode",
    description: "Switch the runtime permission mode. Usage: /mode <name>",
    Icon: Gauge,
    token: "/mode",
  },
  {
    name: "help",
    description: "List built-in commands and skills.",
    Icon: HelpCircle,
    token: "/help",
  },
];

export interface ParsedBuiltin {
  readonly command: BuiltinCommand;
  readonly args: string;
}

/**
 * Detect a leading built-in command in the document text. Returns null if
 * no match — submit then proceeds with normal `messages.send`. Built-ins
 * always supersede skills with the same name.
 */
export const matchBuiltin = (docText: string): ParsedBuiltin | null => {
  const trimmed = docText.trim();
  if (!trimmed.startsWith("/")) return null;
  const head = trimmed.split(/\s+/, 1)[0]!;
  const cmd = BUILTIN_COMMANDS.find((c) => `/${c.name}` === head);
  if (!cmd) return null;
  const args = trimmed.slice(head.length).trim();
  return { command: cmd, args };
};

export const filterBuiltins = (query: string): readonly BuiltinCommand[] => {
  const q = query.toLowerCase();
  if (!q) return BUILTIN_COMMANDS;
  return BUILTIN_COMMANDS.filter((c) => c.name.toLowerCase().startsWith(q));
};
