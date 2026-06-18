import { GridPattenDepth } from "@/components/bento-two/cards/grid-patten-depth";

export const Quotes = () => {
  return (
    <div className="relative flex h-full flex-col justify-end gap-6 p-8">
      <div className="absolute inset-0">
        <div className="-mt-11 ml-20">
          <GridPattenDepth />
        </div>
      </div>
      <div className="z-10">
        <span className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-primary-foreground">
          parallel worktrees
        </span>
      </div>
      <div className="-tracking-xs text-muted-foreground z-10 text-base leading-6 font-medium">
        “I run Claude Code and Codex on the same repo in two chats, each in its
        own worktree. No more terminal tab roulette. The diff pane alone saved
        my afternoon.”
      </div>
      <div className="flex items-center gap-2 z-10">
        <span className="-tracking-xs text-foreground text-base leading-6 font-medium">
          — Staff engineer
        </span>
      </div>
    </div>
  );
};
