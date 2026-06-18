import { Container } from "@/components/container";
import { Header } from "@/components/header";
import { InfoCards, InfoCardsProps } from "@/components/comparison/info-cards";
import {
  ChipIcon,
  CubeIcon,
  DimondIcon,
  DocsIcon,
  DoorsOpenIcon,
  HandShakeIocn,
  HandsIcon,
  MessageIcon,
  MessageSend,
  NodeLines,
} from "@/components/icons/general";
import { ComparisonTabel, ComparisonData } from "@/components/comparison/comparison-tabel";
import { ComparisonAccordion } from "@/components/comparison/comparison-accordion";
import { Button } from "@/components/button";

const cardsData: InfoCardsProps[] = [
  {
    title: "One workspace, every agent",
    description:
      "Claude Code, Codex, Cursor, Gemini, Grok, and OpenCode in a single project-aware app. No tab juggling.",
    icon: <DoorsOpenIcon />,
  },
  {
    title: "Bring your own keys",
    description:
      "Use your own API keys or subscription. memoize never resells tokens, so there is $0 markup on what you run.",
    icon: <DocsIcon />,
  },
  {
    title: "Local-first by default",
    description:
      "Chats and worktrees persist in local SQLite. Your keys live in the macOS Keychain, not our servers.",
    icon: <HandsIcon />,
  },
];

const comparisonData: ComparisonData[] = [
  {
    title: "Where work happens",
    memoize: "One unified, streaming chat timeline",
    traditional: "A pile of scattered terminal tabs",
    icon: <MessageIcon />,
  },
  {
    title: "Switching providers",
    memoize: "Swap Claude, Codex, Gemini, Grok instantly",
    traditional: "Re-learn flags and relaunch each CLI",
    icon: <ChipIcon />,
  },
  {
    title: "Isolation",
    memoize: "A git worktree per chat, no clobbering",
    traditional: "Agents fighting over one working tree",
    icon: <CubeIcon />,
  },
  {
    title: "Reviewing changes",
    memoize: "Built-in PR / diff pane and commit composer",
    traditional: "git diff piped through your memory",
    icon: <NodeLines />,
  },
  {
    title: "Permissions",
    memoize: "Smart policy with per-session overrides",
    traditional: "Blind --yolo or babysitting every prompt",
    icon: <HandShakeIocn />,
  },
  {
    title: "Tool output",
    memoize: "Readable tool calls, thinking, and diffs",
    traditional: "Raw text scrolling past in the buffer",
    icon: <MessageSend />,
  },
  {
    title: "Cost",
    memoize: "Sub-agents delegate to cheaper models",
    traditional: "One expensive model doing everything",
    icon: <DimondIcon />,
  },
];

export const Comparison = () => {
  return (
    <section id="compare" className="w-full scroll-mt-24">
      <Container className="flex flex-col gap-15 py-20 md:py-30">
        <div className="flex flex-col gap-6">
          <Header>memoize vs a pile of terminal tabs</Header>
          <div className="block lg:hidden">
            <Button />
          </div>
        </div>
        <div className="flex flex-col gap-6">
          {/* for desktop only */}
          <div className="bg-card border border-white/10 hidden w-full rounded-3xl lg:block">
            <ComparisonTabel cards={comparisonData} />
          </div>

          {/* for mobile and tablet */}
          <div className="block w-full lg:hidden">
            <ComparisonAccordion cards={comparisonData} />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {cardsData.map((item) => (
              <InfoCards key={item.title} {...item} />
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
};
