import { describe, expect, it } from "bun:test";

import type { PermissionMode } from "@memoize/wire";

import {
  applyPlanModePrefix,
  PLAN_MODE_HTML_INSTRUCTIONS,
  PLAN_MODE_INSTRUCTIONS,
} from "../src/provider/drivers/planMode.ts";

describe("applyPlanModePrefix", () => {
  it("prepends the full instructions (incl. HTML) when plan-artifacts is on", () => {
    const out = applyPlanModePrefix("plan", "fix the bug", true);
    expect(out).toBe(`${PLAN_MODE_INSTRUCTIONS}\n\n---\n\nfix the bug`);
    expect(out.endsWith("fix the bug")).toBe(true);
  });

  it("omits the HTML formatting when plan-artifacts is off (default)", () => {
    const out = applyPlanModePrefix("plan", "fix the bug");
    expect(out.startsWith("PLAN MODE")).toBe(true);
    expect(out.includes(PLAN_MODE_HTML_INSTRUCTIONS)).toBe(false);
    expect(out.endsWith("fix the bug")).toBe(true);
  });

  it("passes the prompt through unchanged outside plan mode", () => {
    const modes: ReadonlyArray<PermissionMode> = ["default", "acceptEdits"];
    for (const mode of modes) {
      expect(applyPlanModePrefix(mode, "fix the bug", true)).toBe(
        "fix the bug",
      );
    }
  });

  it("preserves an empty prompt", () => {
    expect(applyPlanModePrefix("default", "")).toBe("");
    expect(applyPlanModePrefix("plan", "", true)).toBe(
      `${PLAN_MODE_INSTRUCTIONS}\n\n---\n\n`,
    );
  });
});
