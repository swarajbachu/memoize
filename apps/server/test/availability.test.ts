import { describe, expect, it } from "bun:test";

import {
  compareCliVersion,
  grokAuthTestHelpers,
  MIN_CODEX_CLI_VERSION,
  parseCliVersion,
} from "../src/provider/availability.ts";

const { parseGrokAuthJson, extractTier, decodeJwtPayload } = grokAuthTestHelpers;

describe("parseCliVersion", () => {
  it("pulls the first dotted triple out of labelled output", () => {
    expect(parseCliVersion("codex-cli 0.27.0")).toMatchObject({
      major: 0,
      minor: 27,
      patch: 0,
    });
    expect(parseCliVersion("1.0.123 (Claude Code)")).toMatchObject({
      major: 1,
      minor: 0,
      patch: 123,
    });
  });

  it("ignores pre-release suffixes when extracting the baseline triple", () => {
    expect(parseCliVersion("2.5.9-beta.3")).toMatchObject({
      major: 2,
      minor: 5,
      patch: 9,
    });
  });

  it("retains the trimmed raw string", () => {
    expect(parseCliVersion("  0.128.0  ")?.raw).toBe("0.128.0");
  });

  it("returns null for output without a version triple", () => {
    expect(parseCliVersion("no version here")).toBe(null);
    expect(parseCliVersion("1.2")).toBe(null); // only a pair, not a triple
    expect(parseCliVersion("")).toBe(null);
  });
});

describe("compareCliVersion", () => {
  const v = (major: number, minor: number, patch: number) => ({
    major,
    minor,
    patch,
    raw: `${major}.${minor}.${patch}`,
  });

  it("orders by major, then minor, then patch", () => {
    expect(compareCliVersion(v(1, 0, 0), v(0, 9, 9))).toBeGreaterThan(0);
    expect(compareCliVersion(v(0, 128, 0), v(0, 127, 9))).toBeGreaterThan(0);
    expect(compareCliVersion(v(0, 27, 1), v(0, 27, 2))).toBeLessThan(0);
  });

  it("returns 0 for equal versions", () => {
    expect(compareCliVersion(v(0, 128, 0), v(0, 128, 0))).toBe(0);
  });

  it("detects an older-than-minimum codex CLI", () => {
    const old = parseCliVersion("codex-cli 0.27.0")!;
    expect(compareCliVersion(old, MIN_CODEX_CLI_VERSION)).toBeLessThan(0);
  });
});

describe("grok auth probe — tier extraction & parseGrokAuthJson", () => {
  it("decodeJwtPayload handles a real-ish JWT payload", () => {
    // payload: {"tier":7,"email":"u@x.ai"}
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0aWVyIjo3LCJlbWFpbCI6InVAeC5haSJ9.signature";
    const claims = decodeJwtPayload(jwt);
    expect(claims).toEqual({ tier: 7, email: "u@x.ai" });
  });

  it("extractTier finds top-level tier (number)", () => {
    expect(extractTier({ tier: 7 })).toBe(7);
    expect(extractTier({ xai_tier: "5" })).toBe(5);
  });

  it("extractTier finds nested tier", () => {
    expect(extractTier({ subscription: { tier: 6 } })).toBe(6);
    expect(extractTier({ xai: { plan: { tier: 4 } } })).toBe(4);
  });

  it("extractTier DFS-finds deep tier key", () => {
    expect(extractTier({ a: { b: { weird_tier: "8" } } })).toBe(8);
  });

  it("parseGrokAuthJson returns SuperGrok Heavy for tier >= 5", () => {
    const raw = JSON.stringify({
      "user@x.ai": {
        key: "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ0aWVyIjo3LCJlbWFpbCI6InVzZXJAeC5haSJ9.sig",
        email: "user@x.ai",
      },
    });
    const info = parseGrokAuthJson(raw);
    expect(info.authStatus).toBe("authenticated");
    expect(info.authLabel).toBe("SuperGrok Heavy");
    expect(info.authEmail).toBe("user@x.ai");
  });

  it("parseGrokAuthJson returns Requires... only for confirmed low tier", () => {
    const raw = JSON.stringify({
      "free@x.ai": {
        key: "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ0aWVyIjozLCJlbWFpbCI6ImZyZWVAeC5haSJ9.sig",
        email: "free@x.ai",
      },
    });
    const info = parseGrokAuthJson(raw);
    expect(info.authLabel).toBe("Requires SuperGrok Heavy");
  });

  it("parseGrokAuthJson is non-blocking (Grok label) when token present but no usable tier", () => {
    const raw = JSON.stringify({
      "paying@x.ai": {
        // token decodes but has no tier key at all
        key: "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJlbWFpbCI6InBheWluZ0B4LmFpIn0.sig",
        email: "paying@x.ai",
      },
    });
    const info = parseGrokAuthJson(raw);
    expect(info.authLabel).toBe("Grok");
    expect(info.authEmail).toBe("paying@x.ai");
  });

  it("parseGrokAuthJson accepts access_token / jwt / token field names", () => {
    const raw = JSON.stringify({
      "u@x.ai": {
        access_token:
          "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ0aWVyIjo1LCJlbWFpbCI6InVAeC5haSJ9.sig",
        email: "u@x.ai",
      },
    });
    expect(parseGrokAuthJson(raw).authLabel).toBe("SuperGrok Heavy");
  });

  it("parseGrokAuthJson for unparseable file still returns authenticated (non-blocking)", () => {
    const info = parseGrokAuthJson("{not json");
    expect(info.authStatus).toBe("authenticated");
    expect(info.authLabel).toBe("Grok");
  });

  it("parseGrokAuthJson for empty entry still authenticated", () => {
    const info = parseGrokAuthJson(JSON.stringify({}));
    expect(info.authLabel).toBe("Grok");
  });
});
