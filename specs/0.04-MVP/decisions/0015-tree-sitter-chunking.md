# ADR 0015 — Tree-sitter for chunking and symbol extraction

Date: 2026-05-06
Status: Accepted

## Context

The index needs two structured views over source code:

1. **Chunks**: contiguous spans of code we can store, embed, and return as
   search results. Naïve fixed-window chunking (every 40 lines) hurts
   retrieval quality — splitting a function across two chunks means
   neither chunk standalone makes sense.
2. **Symbols**: named entities (functions, classes, types, exported
   constants) with their location, signature, and parent scope. This
   powers Tier 1 symbol lookup, which handles ~60–70% of agent queries.

Both require parsing. Three options:

- **Regex-based heuristics** (`ctags`-style): fast, multi-language, but
  fragile on modern syntax (template literals, JSX, decorators). Misses
  refs entirely without a real parser.
- **Language Server Protocol (LSP) servers**: exact symbol info via real
  type checkers. But spinning up `tsserver`, `gopls`, `pylsp` etc. is
  heavy (each is a separate process, each loads a project graph),
  per-language drift is real, and refs accuracy comes at a startup cost
  measured in seconds-to-minutes on big repos.
- **Tree-sitter**: incremental parser, ~80 grammars, fast, no project-wide
  state, runs in-process. Trade-off: refs accuracy is 70–80% (no full
  type resolution), and resolved by structural rules in the AST.

## Decision

Use **tree-sitter** for chunking and symbol extraction, in-process.

### Grammars (v1)

- `tree-sitter-typescript` (handles `.ts` and `.tsx`)
- `tree-sitter-javascript` (`.js`, `.jsx`, `.mjs`, `.cjs`)
- `tree-sitter-json`
- `tree-sitter-markdown`

Loaded on demand. Python / Go / Rust ship later when there's user demand.
Memoize itself is TypeScript; ship for the first-party use case first.

### Chunking strategy

```
walk AST top-down:
  if node.type ∈ FUNCTION_LIKE:        # function/method/arrow/class
    emit chunk(start, end, kind, content, symbol)
    do not descend into the body
  elif node.type ∈ CLASS_LIKE:
    emit chunk(start, end, kind="class", content, symbol)
    descend (so methods become their own chunks)
  elif node.type == top_level_statement:
    accumulate into a 40-line sliding window chunk
```

This gives us function-level granularity for the things agents actually
search for, while still capturing top-level imports, types, and module
glue.

### Symbol extraction

Use tree-sitter **queries** (`.scm` files) to declaratively pluck
symbols. Example for TypeScript:

```scheme
(function_declaration
  name: (identifier) @symbol.name) @symbol.body
[kind=function]

(class_declaration
  name: (type_identifier) @symbol.name) @symbol.body
[kind=class]

(method_definition
  name: (property_identifier) @symbol.name) @symbol.body
[kind=method]

(type_alias_declaration
  name: (type_identifier) @symbol.name) @symbol.body
[kind=type]

(export_statement (variable_declaration
  (variable_declarator name: (identifier) @symbol.name))) @symbol.body
[kind=const, exported=true]
```

These queries are stable across grammar versions, declarative, and
testable.

### Reference extraction

Walk identifier nodes; resolve via lexical scope only:

- Local-scope match → known
- Module-scope match → known (matches `imports + exports` in same file)
- Cross-file → record by name; resolve at query time against the symbols
  table

This gets us 70–80% accurate refs. For the missing 20–30% (imported names
that shadow a local; namespaces; ambient module declarations), we accept
false negatives in v1 and revisit if eval shows they matter.

### Incremental parsing

Tree-sitter is incremental: when a file changes, we feed the old tree +
the edit and get a new tree without reparsing untouched regions. File
edit re-index target: < 50ms.

## Consequences

### Positive

- One parser library, ~80 grammars supported (we ship 4 now, more on
  demand).
- In-process: no subprocess management, no language-server lifecycle.
- Incremental: file edits are cheap.
- Tree-sitter queries are declarative and language-agnostic to read.
- The `web-tree-sitter` (WASM) variant exists if we ever want to run the
  same chunker in the renderer for live previews — same code, same
  output.
- Tree-sitter is widely used (GitHub uses it for syntax highlighting,
  Neovim, Helix, etc.). Mature, fast, well-tested.

### Negative

- 70–80% refs accuracy for cross-file resolution. Documented; revisit if
  it becomes a real problem.
- Native modules: `tree-sitter` and per-language grammars compile to
  native. Add to the Electron rebuild list (see ADR 0019).
- Each new language costs us a grammar dependency + a query file + a
  test fixture. Acceptable per-language cost.

## Alternatives considered

### LSP servers (tsserver, gopls, etc.)

- Pro: full type resolution; refs accuracy near 100%.
- Con: per-language process management; project-graph startup time
  (seconds to minutes); high memory; per-language drift in capabilities.
  Not worth it for v1's "agent-friendly fast lookup" goal — and we can
  layer LSP-derived enrichment in later if eval shows we need it.

### `ctags` / `universal-ctags`

- Pro: fast, mature, language-agnostic.
- Con: regex-based; struggles with modern syntax; no incremental updates;
  no refs.

### `ast-grep`

- Pro: also tree-sitter-based, mature query language.
- Con: it's a CLI tool. We want library access. We're using tree-sitter
  directly anyway; ast-grep is one more layer.

### Build our own parsers per language

- Pro: maximum control.
- Con: insane.

## What we deliberately rejected

- Per-language LSP integration in v1.
- A non-tree-sitter chunker (regex + heuristics).
- Sub-function chunking (every 5–10 lines). Loses the locality benefit
  that makes function-shaped chunks well-suited to retrieval.

## Reference

Tree-sitter is the same parser GitHub, Neovim, Helix, Zed, and Cursor's
indexer use. Standard choice for this shape of problem. The query files
will live under `packages/index/src/chunker/queries/<language>.scm` and
ship with the package.
