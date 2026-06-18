import Image from "next/image";
import { Container } from "@/components/container";
import {
  Marquee,
  MarqueeContent,
  MarqueeItem,
} from "@/components/kibo-ui/marquee";
import { cn } from "@/lib/utils";

const data = [
  {
    name: "Claude Code",
    role: "agent",
    message: "Streaming tool calls and diffs, not a wall of terminal output.",
    initials: "CC",
  },
  {
    name: "Codex",
    role: "agent",
    message: "Switch providers mid-project without leaving the workspace.",
    initials: "CX",
  },
  {
    name: "Gemini",
    role: "agent",
    message: "A git worktree per chat keeps every experiment isolated.",
    initials: "GM",
  },
];

export const AboutSection = () => {
  return (
    <section className="bg-natural-black text-natural-white relative w-full overflow-hidden">
      <div className="absolute inset-0">
        <div className="relative h-full w-full">
          <div className="absolute top-71 -left-140 h-125.5 w-122 rounded-full bg-white blur-[214px]" />
          <div className="absolute top-0 -left-40 h-293 w-180 rounded-full bg-[#15171A] blur-[287px]" />
          <div className="absolute top-0 -right-100 h-293.75 w-180 rounded-full bg-[#15171A] blur-[287px]" />
          <div
            className={cn(
              "absolute top-10 right-52 h-141 w-197",
              "bg-[linear-gradient(to_right,#24272A_1px,transparent_1px),linear-gradient(to_bottom,#24272A_1px,transparent_1px)] bg-size-[44px_44px]",
              "mask-[radial-gradient(circle,black_10%,transparent_100%)]",
            )}
          ></div>
        </div>
      </div>

      <Container className="relative z-20 flex w-full flex-col gap-20 pt-20 pb-30">
        <div className="-tracking-xl text-6xl leading-18 font-medium">
          Why memoize
        </div>
        <div className="grid w-full grid-cols-1 justify-between gap-30 lg:grid-cols-5">
          <div className="relative lg:col-span-2">
            <Image
              src={"/assets/product/memoize-new-chat.png"}
              alt="memoize workspace"
              width={1878}
              height={1088}
              className="w-full rounded-xl object-cover shadow-2xl shadow-black/40"
            />
          </div>
          <div className="flex h-full w-full flex-col justify-between gap-15 lg:col-span-3">
            <div className="flex flex-col gap-6">
              <span className="-tracking-xs text-lg leading-6.5 font-medium">
                Every coding agent ships its own CLI. Run a few of them and you
                end up juggling terminal tabs, copy-pasting between models, and
                losing track of which agent touched which branch. None of them
                share state, and none of them were built to sit next to each
                other.
              </span>
              <span className="-tracking-xs text-lg leading-6.5 font-medium">
                memoize puts Claude Code, Codex, Cursor, Gemini, Grok, and
                OpenCode in one project-aware workspace. You get a real
                streaming chat timeline of tool calls, thinking, and diffs, a
                git worktree per chat, and a PR pane to review and commit. Switch
                providers without switching apps.
              </span>
              <span className="-tracking-xs text-muted-foreground text-lg leading-6.5 font-medium">
                It is local-first by design. Your chats live in SQLite on your
                machine and your API keys stay in the macOS Keychain. You bring
                your own keys or subscription, and memoize never resells tokens
                or adds markup. Your code and credentials stay yours.
              </span>
            </div>
            <div>
              <Marquee
                className={cn(
                  "flex h-full max-h-22 items-center",
                  "mask-[linear-gradient(to_right,transparent,black_20%,black_80%,transparent)]",
                )}
              >
                <MarqueeContent className="h-full">
                  {data.map((item, index) => (
                    <MarqueeItem key={index}>
                      <div className="flex w-88 flex-col gap-2 rounded-xl bg-white/[0.06] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                        <div className="flex w-full items-center justify-between gap-4">
                          <div className="flex items-center gap-2">
                            <span className="flex size-8 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                              {item.initials}
                            </span>
                            <span className="-tracking-xs text-muted-foreground text-sm leading-6.5 font-medium">
                              {item.name}, {item.role}
                            </span>
                          </div>
                          <span className="rounded-full bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground">
                            memoize
                          </span>
                        </div>
                        <div className="-tracking-xs text-sm leading-5 font-medium text-natural-white">
                          {item.message}
                        </div>
                      </div>
                    </MarqueeItem>
                  ))}
                </MarqueeContent>
              </Marquee>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
};
