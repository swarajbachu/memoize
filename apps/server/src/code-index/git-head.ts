import { Effect } from "effect";
import { promises as fs, watch } from "node:fs";
import { join } from "node:path";

export type HeadChangeListener = (newBranch: string | null) => void;

const POLL_MS = 1_500;

/**
 * Subscribe to branch changes by watching `.git/HEAD`. Most checkouts
 * touch this file; bare-repo edge cases fall through to a 1.5s poll.
 * The callback is called only when the parsed branch actually changes,
 * so onlookers don't get noise when git updates HEAD for unrelated
 * reasons (rebase i-mode, reset --soft, etc.).
 */
export const startGitHeadWatcher = (
  root: string,
  onChange: HeadChangeListener,
): Effect.Effect<{ stop: () => void; current: () => string | null }> =>
  Effect.sync(() => {
    let last: string | null = null;
    let stopped = false;

    const parseHead = async (): Promise<string | null> => {
      try {
        const txt = await fs.readFile(join(root, ".git", "HEAD"), "utf8");
        const trimmed = txt.trim();
        if (trimmed.startsWith("ref: refs/heads/")) {
          return trimmed.slice("ref: refs/heads/".length);
        }
        // Detached HEAD — return the sha (truncated).
        return trimmed.slice(0, 12);
      } catch {
        return null;
      }
    };

    const tick = async () => {
      if (stopped) return;
      const now = await parseHead();
      if (now !== last) {
        last = now;
        try {
          onChange(now);
        } catch (cause) {
          // eslint-disable-next-line no-console
          console.error("[code-index.git-head] listener threw:", cause);
        }
      }
    };

    // Initial read.
    void tick();

    // Best-effort fs.watch on .git/HEAD. macOS handles this fine; on
    // Linux some filesystems don't fire events for tiny atomic writes.
    let handle: ReturnType<typeof watch> | null = null;
    try {
      handle = watch(join(root, ".git", "HEAD"), () => void tick());
      handle.on("error", () => {
        /* swallow; poll fallback runs anyway */
      });
    } catch {
      // .git/HEAD missing — not a git repo. Poll keeps trying.
    }

    const timer = setInterval(() => void tick(), POLL_MS);
    return {
      stop: () => {
        stopped = true;
        clearInterval(timer);
        handle?.close();
      },
      current: () => last,
    };
  });
