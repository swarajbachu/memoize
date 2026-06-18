import { Button } from "@/components/button";
import { Container } from "@/components/container";

export const BlogCtaSection = () => {
  return (
    <section>
      <Container className="flex items-center justify-center pt-30 pb-50">
        <div className="flex w-full max-w-200 flex-col gap-6">
          <span className="text-foreground -tracking-sm text-3xl leading-10 font-medium">
            Every AI coding agent, one chat-first workspace on your Mac.
          </span>
          <span className="-tracking-xs text-muted-foreground text-base leading-6 font-medium">
            memoize wraps Claude Code, Codex, Cursor, Gemini, Grok, and OpenCode
            in a single project-aware app. A real streaming chat timeline,
            git worktrees per chat, and a diff viewer built for review. No raw
            terminals, no resold tokens.
          </span>
          <span className="-tracking-xs text-muted-foreground text-base leading-6 font-medium">
            It is local-first by design: chats in SQLite on disk, keys in the
            macOS Keychain. Bring your own keys and run it free during alpha.
          </span>
          <div>
            <Button />
          </div>
        </div>
      </Container>
    </section>
  );
};

