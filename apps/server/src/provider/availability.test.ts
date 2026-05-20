import { describe, expect, it } from "bun:test";

import { grokAuthTestHelpers } from "./availability.ts";

const { parseGrokAuthJson, extractTier, decodeJwtPayload } = grokAuthTestHelpers;

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
