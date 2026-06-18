import {
  Marquee,
  MarqueeContent,
  MarqueeFade,
  MarqueeItem,
} from "@/components/kibo-ui/marquee";

const features = [
  "Unified chat timeline",
  "Git worktrees per chat",
  "PR / diff pane",
  "Permission controls",
  "Sub-agent delegation",
  "Local-first SQLite",
  "Slash commands",
  "@-mention files",
];

export const BottomMarquee = () => {
  return (
    <div className="relative flex h-full items-center px-8">
      <div className="-tracking-xs text-foreground text-lg leading-6.5 font-medium text-nowrap">
        What you get
      </div>
      <Marquee className="flex h-full max-h-22 items-center">
        <MarqueeFade side="left" className="from-card" />
        <MarqueeFade side="right" className="from-card" />
        <MarqueeContent className="h-full">
          {features.map((feature, index) => (
            <MarqueeItem
              className="shadow-card-md mx-3 flex items-center gap-2.5 rounded-2xl px-4 py-2"
              key={index}
            >
              <span className="bg-primary size-1.5 shrink-0 rounded-full" />
              <span className="-tracking-xs text-foreground text-sm leading-4 font-medium text-nowrap">
                {feature}
              </span>
            </MarqueeItem>
          ))}
        </MarqueeContent>
      </Marquee>
    </div>
  );
};
