# Feature: Preset library

The three sub-agents that ship by default. They cover the cases where
delegating to a cheaper model is unambiguously a win:

1. **`research`** — read-only codebase exploration.
2. **`file-edits`** — well-scoped file changes.
3. **`test-runner`** — running a test suite and parsing output.

These ship enabled out-of-the-box (assuming the Claude provider is
configured). The user can toggle each, edit each, or disable the whole
feature in settings.

The presets live in `apps/renderer/src/lib/subagent-presets.ts` and the
server reads the same file via the wire (sent as part of
`StartSessionInput.agents` when starting a session). Single source of
truth in TypeScript.

## `research` — Haiku 4.5

The single highest-value preset. Almost every Opus session today spends
a meaningful fraction of its tokens on `Glob` / `Grep` / `Read` chains
just to find the right file before doing the actual work. Routing those
to Haiku is the obvious win.

```ts
{
  description:
    "Read-only codebase exploration. Use when you need to find files, " +
    "understand patterns, list usages of a symbol, or summarize " +
    "unfamiliar code. The agent has Read, Glob, and Grep — no edit, " +
    "no Bash, no network. Best for 'find every place that does X' " +
    "or 'how does Y work in this codebase' before making a change.",
  prompt:
    "You are a codebase research assistant. Your job is to find and " +
    "summarize information from the project. You have read-only " +
    "tools: Read, Glob, Grep. Be efficient — search precisely, read " +
    "only what's needed, return a concise summary that fully answers " +
    "the parent's question. Cite file paths and line numbers. Don't " +
    "speculate beyond the code you've actually read.",
  tools: ["Read", "Glob", "Grep"],
  model: "claude-haiku-4-5",
  maxTurns: 25,
}
```

**Why Haiku**: research is search-heavy and reasoning-light. Haiku is
fast enough that the round-trip latency stays acceptable, and the
read-only tool set keeps the blast radius zero. ADR
[0011-haiku-as-default-research.md](../decisions/0011-haiku-as-default-research.md)
covers this in full.

**Why `maxTurns: 25`**: most "find X" tasks complete in under 10 turns;
25 is generous headroom that still bounds runaway exploration if the
agent gets stuck in a `grep → read → grep` loop.

## `file-edits` — Sonnet 4.6

Routine refactors and multi-file edits where the *what* is well-defined
but the *where* is repetitive. Sonnet is the right tier — Haiku
sometimes hallucinates imports or misreads context on multi-file edits;
Opus is overkill for "rename this prop in 14 files."

```ts
{
  description:
    "Apply a well-defined file change. Use for routine refactors, " +
    "renames, prop additions, or any multi-file edit where the parent " +
    "agent has already decided what to change and just needs it " +
    "executed. Don't use this when the change requires architecture " +
    "decisions — keep that on the main model.",
  prompt:
    "You are a file editor. Apply the change described in the prompt " +
    "exactly. Read each file before editing it. Preserve existing " +
    "style — indentation, quote style, import order. If the change is " +
    "ambiguous, return without editing and ask the parent to clarify. " +
    "Don't refactor adjacent code, don't add comments, don't 'improve' " +
    "anything that isn't part of the requested change.",
  tools: ["Read", "Edit", "Write", "Glob"],
  model: "claude-sonnet-4-6",
  maxTurns: 40,
}
```

**Why Sonnet, not Haiku**: edits to TypeScript/TSX with proper import
preservation and JSX formatting are where Haiku's lower coding accuracy
starts to bite. Sonnet 4.6 is the cheapest Claude tier we trust for
direct code modification.

**Why no `Bash`**: deliberate. File-edit sub-agents shouldn't be
running `bun install` or `git commit`. If a follow-up command is
needed, the parent agent runs it in main context where the user can see
the output.

## `test-runner` — Haiku 4.5

Running a test command and parsing the output is exactly the
"high-token-volume, low-reasoning" case sub-agents are good for. A
1000-line vitest output flattens to "3 failures in `auth.test.ts`,
here's the assertion text" — the parent doesn't need the rest.

```ts
{
  description:
    "Run a test suite and parse the output. Use after making changes " +
    "to verify nothing broke, or when the parent needs to see what's " +
    "currently failing. The agent runs the project's test command " +
    "(e.g. `bun test`, `vitest`, `pytest`) and returns a summary of " +
    "pass/fail counts plus the assertion text for any failures.",
  prompt:
    "You are a test runner. Detect the project's test command from " +
    "package.json scripts or by asking the parent. Run it. Parse the " +
    "output. Return: total passed, total failed, total skipped, and " +
    "for each failure, the test name + the assertion message + the " +
    "first frame of the stack that points to project code (skip " +
    "framework frames). Don't try to fix the failures — just report.",
  tools: ["Bash", "Read", "Grep"],
  model: "claude-haiku-4-5",
  maxTurns: 15,
  permissionMode: "default",   // Bash always prompts unless allowlisted
}
```

**Why `permissionMode: "default"`**: `Bash` is the highest-blast-radius
tool. We don't want the test-runner sub-agent to silently `rm -rf`
something because the user gave the main session full-access mode. The
sub-agent's `permissionMode` shadows the session's runtime mode for its
own tool calls.

**Failure mode to watch**: if the sub-agent guesses the wrong test
command and runs something destructive instead, the sensitive-path
checks won't catch it. Mitigation is the prompt's emphasis on
*detecting* the command from `package.json` rather than inferring.

## Disabled-by-default candidates (not shipped yet)

Listed here so the next round has somewhere to land.

- **`pr-summary`** — read git diff, write a PR description.
  Read-only-ish; Haiku is fine. Defer until Phase 2's git surface
  exists.
- **`error-classifier`** — given a stack trace, find the source line
  and classify the error category. Niche.
- **`migration-planner`** — analyze a database migration for safety.
  Specialized; needs Sonnet.
- **`codex-bridge`** — proxy to a Codex sub-session. Phase 2 (see
  [cross-provider.md](cross-provider.md)).

## How the user picks which presets to enable

See [sub-agents.md](sub-agents.md) → "Settings" — the full settings page
section with toggles, model dropdowns, and per-preset edit sheets.
Defaults: all three enabled if the user has the Claude provider
configured.

## Telemetry / observability hooks

Each preset run logs (locally, to the existing memoize log file):

```
[subagent.research] turns=8 in=12.4k out=312 cache_read=4.2k duration=3.1s
```

Useful for tuning prompts and `maxTurns` after we see real usage. No
network telemetry — memoize is local-only by principle.
