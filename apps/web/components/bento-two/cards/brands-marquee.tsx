import {
  Marquee,
  MarqueeContent,
  MarqueeFade,
  MarqueeItem,
} from "@/components/kibo-ui/marquee";
import { AGENTS } from "@/lib/site";

export const BrandsMarquee = () => {
  return (
    <div className="relative flex h-full items-center">
      <Marquee className="flex h-full max-h-22 items-center">
        <MarqueeFade side="left" className="from-card" />
        <MarqueeFade side="right" className="from-card" />
        <MarqueeContent direction="right" className="h-full">
          {AGENTS.map((name, index) => (
            <MarqueeItem
              className="shadow-card-md flex items-center gap-2.5 rounded-lg px-2.5 py-1.75"
              key={index}
            >
              <span className="bg-primary size-2 shrink-0 rounded-full" />
              <span className="-tracking-xs text-foreground text-sm leading-3.5 font-medium text-nowrap">
                {name}
              </span>
            </MarqueeItem>
          ))}
        </MarqueeContent>
      </Marquee>
    </div>
  );
};
