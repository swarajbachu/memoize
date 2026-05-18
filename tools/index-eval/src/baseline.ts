import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { type EvalTask } from "./tasks.ts";
import { type RunResult } from "./types.ts";

const CHARS_PER_TOKEN = 4;

const charsOf = (s: string): number => s.length;

const tryRead = (abs: string, maxLines: number): { content: string; lines: number } => {
  try {
    const stat = statSync(abs);
    if (stat.size > 200_000) return { content: "", lines: 0 };
    const text = readFileSync(abs, "utf8");
    const lines = text.split(/\r?\n/);
    if (lines.length <= maxLines) return { content: text, lines: lines.length };
    return {
      content: lines.slice(0, maxLines).join("\n"),
      lines: maxLines,
    };
  } catch {
    return { content: "", lines: 0 };
  }
};

/**
 * Simulate the baseline agent path: `Bash(rg <pattern>)` → pick the top
 * candidate → `Read(path)`. We don't run a real LLM — we tally character
 * counts that approximate the tokens an LLM would consume to read each
 * tool result. The exact numerator doesn't matter; the ratio against
 * Tier-1 is what we report.
 */
export const runBaselineTask = (
  repoRoot: string,
  task: EvalTask,
): RunResult => {
  const t0 = Date.now();
  const pattern = task.grepPattern ?? task.symbol ?? task.id;
  // Mimic the `Bash` tool call signature in the agent transcript.
  const toolCalls: string[] = [];
  const toolCall = `Bash(rg --json -n -S '${pattern.replace(/'/g, "")}' .)`;
  toolCalls.push(toolCall);
  let inputChars = charsOf(toolCall);

  // Use `git grep` — Bun subprocesses don't always inherit a full PATH,
  // so ripgrep may be missing. `git grep` is guaranteed available wherever
  // we're indexing and respects .gitignore by definition.
  const rg = spawnSync(
    "git",
    [
      "grep",
      "-n",
      "-I", // skip binary files
      "--max-count=20",
      "-e",
      pattern,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 2_000_000,
    },
  );
  const rgOutput = (rg.stdout ?? "") + (rg.stderr ?? "");
  if (rgOutput.length === 0 && rg.error) {
    process.stderr.write(
      `[baseline ${task.id}] git grep failed: ${rg.error.message}\n`,
    );
  }
  inputChars += charsOf(rgOutput);

  const candidatePaths: string[] = [];
  for (const line of rgOutput.split("\n")) {
    const idx = line.indexOf(":");
    if (idx < 1) continue;
    const raw = line.slice(0, idx).trim();
    // rg in `.` produces `./foo/bar:42:…` — normalize so dedup + the
    // acceptableFiles check both work.
    const path = raw.replace(/^\.\//, "");
    if (path.length === 0) continue;
    if (path.endsWith(":")) continue;
    if (!candidatePaths.includes(path)) candidatePaths.push(path);
    if (candidatePaths.length >= 4) break;
  }

  let succeeded = false;
  for (const cp of candidatePaths) {
    const norm = cp.replace(/^\.\//, "");
    if (task.acceptableFiles.some((af) => norm === af || norm.endsWith(af))) {
      succeeded = true;
    }
    const abs = resolve(repoRoot, cp);
    // The agent would `Read` the whole file. Mimic with a 400-line cap
    // (matches Claude SDK Read default).
    const { content } = tryRead(abs, 400);
    const readCall = `Read(${cp})`;
    toolCalls.push(readCall);
    inputChars += charsOf(readCall) + charsOf(content);
  }

  // Output: a single 1-line model response.
  const outputChars = 80;
  const totalChars = inputChars + outputChars;

  return {
    taskId: task.id,
    tier: "baseline",
    succeeded,
    tokens: Math.round(totalChars / CHARS_PER_TOKEN),
    wallMs: Date.now() - t0,
    toolCalls: toolCalls.length,
    notes: candidatePaths.join(","),
  };
};

export const runBaseline = (
  repoRoot: string,
  tasks: ReadonlyArray<EvalTask>,
): ReadonlyArray<RunResult> => tasks.map((t) => runBaselineTask(repoRoot, t));
