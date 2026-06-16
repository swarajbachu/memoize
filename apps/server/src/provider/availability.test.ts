import { describe, expect, it } from "bun:test";

import {
  buildUpdateCommand,
  deriveLatestAdvisory,
  grokAuthTestHelpers,
  selectCliPathCandidate,
} from "./availability.ts";

const { parseGrokAuthJson, extractTier, decodeJwtPayload } =
  grokAuthTestHelpers;

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

describe("deriveLatestAdvisory — update-available verdict", () => {
  it("reports behind when installed < latest", () => {
    expect(deriveLatestAdvisory("1.0.5", "1.0.9")).toBe("behind");
    expect(deriveLatestAdvisory("0.128.0", "0.130.2")).toBe("behind");
    expect(deriveLatestAdvisory("1.2.3", "2.0.0")).toBe("behind");
  });

  it("reports current when installed == or > latest", () => {
    expect(deriveLatestAdvisory("1.0.9", "1.0.9")).toBe("current");
    expect(deriveLatestAdvisory("2.1.0", "2.0.5")).toBe("current");
  });

  it("tolerates label-wrapped version strings (parser pulls the triple)", () => {
    // `claude --version` prints "1.0.123 (Claude Code)"
    expect(deriveLatestAdvisory("1.0.123 (Claude Code)", "1.0.140")).toBe(
      "behind",
    );
    expect(deriveLatestAdvisory("codex-cli 0.130.0", "0.130.0")).toBe(
      "current",
    );
  });

  it("reports unknown when either side is missing or unparsable", () => {
    expect(deriveLatestAdvisory(undefined, "1.0.0")).toBe("unknown");
    expect(deriveLatestAdvisory("1.0.0", null)).toBe("unknown");
    expect(deriveLatestAdvisory("not-a-version", "1.0.0")).toBe("unknown");
  });
});

describe("selectCliPathCandidate", () => {
  it("prefers a user Codex install over Conductor's managed Codex shim", () => {
    expect(
      selectCliPathCandidate("codex", [
        "/Users/me/Library/Application Support/com.conductor.app/./bin/codex",
        "/Users/me/.nvm/versions/node/v23.10.0/bin/codex",
      ]),
    ).toBe("/Users/me/.nvm/versions/node/v23.10.0/bin/codex");
  });

  it("falls back to Conductor's managed Codex when it is the only candidate", () => {
    expect(
      selectCliPathCandidate("codex", [
        "/Users/me/Library/Application Support/com.conductor.app/./bin/codex",
      ]),
    ).toBe("/Users/me/Library/Application Support/com.conductor.app/./bin/codex");
  });

  it("keeps first PATH match for non-Codex providers", () => {
    expect(
      selectCliPathCandidate("claude", [
        "/opt/homebrew/bin/claude",
        "/Users/me/.local/bin/claude",
      ]),
    ).toBe("/opt/homebrew/bin/claude");
  });
});

describe("buildUpdateCommand — install-method detection", () => {
  it("uses the exact Conductor-managed standalone Codex binary updater", () => {
    expect(
      buildUpdateCommand("codex", [
        "/Users/me/Library/Application Support/com.conductor.app/./bin/codex",
        "/Users/me/Library/Application Support/com.conductor.app/agent-binaries/codex/0.138.0/codex",
      ]),
    ).toBe(
      "'/Users/me/Library/Application Support/com.conductor.app/./bin/codex' update",
    );
  });

  it("uses the native self-updater for a native Claude install", () => {
    expect(buildUpdateCommand("claude", ["/Users/me/.local/bin/claude"])).toBe(
      "claude update",
    );
  });

  it("uses the native self-updater for a native OpenCode install", () => {
    expect(
      buildUpdateCommand("opencode", ["/Users/me/.opencode/bin/opencode"]),
    ).toBe("opencode upgrade");
  });

  it("uses npm (uninstall-then-install) for an nvm/npm-global install", () => {
    // `which` returns the bin symlink; realpath points into node_modules.
    const cmd = buildUpdateCommand("codex", [
      "/Users/me/.nvm/versions/node/v23.10.0/bin/codex",
      "/Users/me/.nvm/versions/node/v23.10.0/lib/node_modules/@openai/codex/bin/codex.js",
    ]);
    expect(cmd).toBe(
      "npm uninstall -g @openai/codex || true; npm install -g @openai/codex@latest",
    );
  });

  it("uses bun / pnpm for those global installs", () => {
    expect(buildUpdateCommand("codex", ["/Users/me/.bun/bin/codex"])).toBe(
      "bun i -g @openai/codex@latest",
    );
    expect(
      buildUpdateCommand("codex", ["/Users/me/.local/share/pnpm/codex"]),
    ).toBe("pnpm add -g @openai/codex@latest");
  });

  it("uses brew when the binary lives under a Homebrew prefix", () => {
    expect(buildUpdateCommand("codex", ["/opt/homebrew/bin/codex"])).toBe(
      "brew upgrade codex",
    );
  });

  it("defaults npm providers to npm when the path is unknown / absent", () => {
    expect(buildUpdateCommand("gemini", [])).toBe(
      "npm uninstall -g @google/gemini-cli || true; npm install -g @google/gemini-cli@latest",
    );
  });

  it("does not update npm when an npm provider path is an unknown absolute install", () => {
    expect(buildUpdateCommand("codex", ["/opt/custom/codex"])).toBeNull();
  });

  it("reinstalls via the install one-liner for curl-based CLIs (Grok)", () => {
    expect(buildUpdateCommand("grok", ["/Users/me/.local/bin/grok"])).toBe(
      "curl -fsSL https://x.ai/cli/install.sh | bash",
    );
  });
});
