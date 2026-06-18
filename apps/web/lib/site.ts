// Central place for memoize's brand constants and outbound links so we only
// edit them once. Swap DOWNLOAD_URL to the direct signed .dmg asset once a
// release exists.

export const SITE_NAME = "memoize";

export const GITHUB_URL = "https://github.com/swarajbachu/memoize";

// Points at the latest GitHub release for now. Replace with the direct
// `.dmg` download URL when a signed build is published.
export const DOWNLOAD_URL = `${GITHUB_URL}/releases/latest`;

export const TAGLINE =
  "Every AI coding agent, one chat-first workspace on your Mac.";

// The coding agents memoize wraps. Used by the logo cloud / brands marquee.
export const AGENTS = [
  "Claude Code",
  "Codex",
  "Cursor",
  "Gemini",
  "Grok",
  "OpenCode",
] as const;
