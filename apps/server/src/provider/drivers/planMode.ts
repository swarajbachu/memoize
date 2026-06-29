import type { PermissionMode } from "@zuse/wire";

/**
 * Developer-instructions prefix that emulates plan mode for providers that
 * don't have a native equivalent. The Claude Agent SDK has `permissionMode:
 * "plan"`, Cursor's ACP has `setSessionMode("plan")`, but Codex/Grok/Gemini
 * don't expose a runtime read-only switch — so we prepend this block to the
 * user's prompt while plan mode is active.
 *
 * The model is still free to ignore it, which is why we ALSO keep
 * `RuntimeMode: "approval-required"` as the safety net for any tool call
 * that wants to mutate state.
 */
const PLAN_MODE_READONLY =
  "PLAN MODE — you are in read-only planning mode. Investigate the " +
  "codebase, ask clarifying questions if needed, then propose a concrete " +
  "plan. DO NOT modify files, run mutating commands, or invoke any tool " +
  "that writes to disk or the network. When you have a complete plan, " +
  "present it for approval and wait for the user to confirm before " +
  "exiting plan mode.";

/**
 * Plan formatting: emit the plan as a rich, VISUAL self-contained HTML document
 * (rendered as an embedded, annotatable artifact the user can click to leave
 * inline feedback). Used by every provider in plan mode. Designed to look great
 * embedded in a DARK app, and to be skimmable — colour, hierarchy, and grouping
 * carry meaning so the user understands the plan at a glance, not a wall of text.
 */
export const PLAN_MODE_HTML_INSTRUCTIONS = [
  "Present the FINAL plan as a SINGLE, SELF-CONTAINED, VISUALLY RICH HTML",
  "DOCUMENT — a review surface the user skims in seconds, NOT a wall of text",
  "and NOT plain markdown. If you have an ExitPlanMode tool, put the whole",
  "document in its `plan` field; otherwise emit exactly ONE ```html fenced",
  "block. It renders embedded in a DARK app, in a sandbox that allows scripts",
  "and network, and the user clicks elements / selects text to annotate them.",
  "",
  "DESIGN DIRECTION — pick in this strict priority: (1) if the user named a look",
  "or design system, use it; (2) else if the plan is about a specific app or",
  "codebase, MATCH that project's own design system — its Tailwind/theme config,",
  "CSS variables / design tokens, component library, or brand — so the plan",
  "looks like it belongs to the product; (3) else use the polished dark system",
  "below. State which you used in one short comment.",
  "",
  "You MAY (and for components/diagrams SHOULD) load a CDN — it works here:",
  "Tailwind v4 browser runtime + DaisyUI v5 for polished components, and Mermaid",
  "for any flow / architecture / state / sequence diagram (never hand-build",
  "boxes-and-arrows from divs). If you don't use a CDN, hand-write inline CSS to",
  "the SAME quality bar — the result must never look default-browser plain.",
  "",
  "DEFAULT DARK SYSTEM (when hand-writing CSS): page bg #0d0d12; cards #16161d",
  "with 1px #262630 borders, ~12px radius, and a soft shadow; text #e7e7ea,",
  "muted #9b9ba6; accents that MEAN things — lime #84cc16, sky #38bdf8, amber",
  "#fbbf24, rose #fb7185, violet #a78bfa. System font stack, a real type scale",
  "(≈24/17/14/12px), generous spacing (16–24px). A header band (plan title +",
  "one-line summary, optional gradient accent) sets the tone.",
  "",
  "STRUCTURE so hierarchy is obvious at a glance:",
  "- Group work into titled CARDS / sections (Goal, Changes per file or area,",
  "  Verification, Risks). Use a responsive card grid where it helps.",
  "- Number each step with a badge; tag items with COLOUR-CODED pills (e.g.",
  "  New=lime, Edit=sky, Delete=rose; or risk High/Med/Low).",
  "- Use TABLES for dense comparisons (option A vs B, current vs target) and",
  "  callout boxes for risks/notes. Every element keeps readable visible TEXT.",
  "",
  "ROBUSTNESS: self-contained (no local assets; CDN-only externals), no looping",
  "animations. Prevent horizontal overflow at EVERY nesting level — give",
  "grid/flex children `minmax(0,1fr)` tracks and `min-width:0`, and wrap or",
  "truncate long unbreakable text (paths, ids, monospace). Make it intentional",
  "and genuinely polished.",
].join("\n");

export const PLAN_MODE_INSTRUCTIONS = `${PLAN_MODE_READONLY}\n\n${PLAN_MODE_HTML_INSTRUCTIONS}`;

/**
 * Wrap a user-supplied prompt with the plan-mode developer-instructions
 * prefix iff plan mode is active. No-op for `default` / `acceptEdits`. For
 * providers that emulate plan mode via the prompt (no runtime read-only switch).
 */
export const applyPlanModePrefix = (
  permissionMode: PermissionMode,
  text: string,
  /** Include the visual-HTML formatting guidance (the plan-artifacts flag). */
  includeHtml = false,
): string => {
  if (permissionMode !== "plan") return text;
  const prefix = includeHtml ? PLAN_MODE_INSTRUCTIONS : PLAN_MODE_READONLY;
  return `${prefix}\n\n---\n\n${text}`;
};
