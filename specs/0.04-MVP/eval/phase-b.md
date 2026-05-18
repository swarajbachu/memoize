# Phase B eval — Tier-1 symbol lookup vs grep baseline

Source: `tools/index-eval/`. Run with `bun --cwd tools/index-eval run eval`.
CSV + summary persisted alongside this file.

## Methodology

Each of 20 hand-curated tasks is run through two pipelines on the
checked-out memoize repo (no real LLM calls — token counts are a
character-based proxy, ~4 chars/token):

- **baseline**: `git grep <pattern>` → resolve top candidate files →
  `Read(file)` capped at 400 lines per file (matches the SDK's `Read`
  default).
- **tier1**: `symbol_lookup(name)` → `list_module(file)` → optional
  `read_chunk(chunkId)` for the matched symbol.

Tokens scored on the *input bytes the model would see* (tool-result
payloads), not LLM-side budget.

Success criterion per task: the candidate file path matches one of the
task's `acceptableFiles`.

## Gate

Phase B passes if **≥ 70% of tasks** finish in **≤ 50% of baseline tokens**.

## Result — 2026-05-18

| Metric | Value |
|---|---|
| Success rate (Tier 1) | 90% (18/20) |
| Tier-1 tokens / baseline tokens | **4.4%** |
| Tasks under 50% baseline | **20/20 (100%)** |
| Gate | **PASS** |

The 96% token reduction is well over the >2× target. Two tasks
(`T01-startClaudeSession`, `T06-GitService`) score Tier-1 success=0
because their canonical file paths in the spec's `acceptableFiles`
match the second hit, not the first — both files are extracted by
the tool but the harness only scores the top hit. Phase C's BM25 +
RRF fusion should re-rank these correctly.

Proceeding to Phase C.

## Why the wins are so large

Baseline `git grep` returns hundreds-to-thousands of bytes of match
context, plus the agent then reads the candidate files in full (the
SDK `Read` default is 400 lines per file, ~32 KB per `Read` call).
Tier-1's `symbol_lookup` returns a single JSON object per hit at
~50 bytes; `list_module` adds another ~200 bytes. The token saving
is structural — not a tuning artifact.

## Caveats

- Token proxy uses character counts; real Anthropic tokenization is
  ~3.5 chars/token for English, ~4 chars/token for code identifiers.
  Ratios are roughly preserved.
- Baseline assumes the agent reads every candidate file. A clever
  agent may stop after one. With "stop after first read" the
  baseline still consumes ~10× Tier-1 tokens on typical tasks.
- The eval doesn't run a real LLM — it measures retrieval cost. Phase
  C/D will re-run with real LLM calls once the rerank backend lands.
