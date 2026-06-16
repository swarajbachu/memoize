import { describe, expect, it } from "bun:test";

import { isIgnorableGrokAuthNoise } from "../src/provider/drivers/acp/grok-auth-noise.ts";

describe("isIgnorableGrokAuthNoise", () => {
  it("ignores transient AuthorizationRequired chatter (case-insensitive)", () => {
    const noisy = [
      "AuthorizationRequired",
      "Auth(AuthorizationRequired)",
      "error: AUTHORIZATIONREQUIRED while refreshing token",
      "Grok authentication failed: AuthorizationRequired",
      "worker quit with fatal auth error",
      "transport channel closed (auth refresh)",
    ];
    for (const line of noisy) {
      expect(isIgnorableGrokAuthNoise(line)).toBe(true);
    }
  });

  it("does not ignore real errors", () => {
    const real = [
      "SyntaxError: unexpected token",
      "ENOENT: no such file or directory",
      "grok authentication failed", // missing the AuthorizationRequired co-signal
      "worker quit with fatal segfault", // fatal but not auth
      "transport channel closed", // closed but not auth
      "",
    ];
    for (const line of real) {
      expect(isIgnorableGrokAuthNoise(line)).toBe(false);
    }
  });
});
