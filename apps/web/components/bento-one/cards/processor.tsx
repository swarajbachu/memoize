import { cn } from "@/lib/utils";
import { AnimatedSVG } from "@/components/bento-one/cards/animated-svg-1";
import { AnimatedSVG2 } from "@/components/bento-one/cards/animated-svg-2";
import { AnimatedSVG3 } from "@/components/bento-one/cards/animated-svg-3";

export const Processor = () => {
  return (
    <div
      className={cn(
        "relative ml-4 h-[314px] w-[336px] scale-110 overflow-hidden",
        "mask-[linear-gradient(180deg,rgba(255,255,255,0)_0%,rgba(0,0,0,1)_50%)]",
      )}
    >
      <div className="absolute bottom-6.5 left-0">
        <AnimatedSVG />
      </div>
      <div className="absolute top-1 left-0">
        <AnimatedSVG2 />
      </div>
      <div className="absolute right-0.5 bottom-1">
        <AnimatedSVG3 />
      </div>

      <div className="absolute -bottom-48 left-12 -translate-x-full -translate-y-full">
        <div className="absolute -top-3 right-8 h-3 w-1.5 bg-[#EEEEEE]" />
        <div className="relative size-28 rounded-3xl bg-white/50 shadow-[0px_2px_12px_0px_rgba(0,0,0,0.12)]" />
      </div>

      <div className="absolute right-3 bottom-16">
        <div className="absolute -inset-3">
          <div className="absolute top-1/2 h-20 w-3 -translate-y-1/2">
            <div className="absolute top-0 left-0 h-1.5 w-3 bg-[#EEEEEE]" />
            <div className="absolute top-[17px] left-0 h-1.5 w-3 bg-[#EEEEEE]" />
            <div className="absolute top-[34px] left-0 h-1.5 w-3 bg-[#EEEEEE]" />
            <div className="absolute top-[51px] left-0 h-1.5 w-3 bg-[#EEEEEE]" />
            <div className="absolute top-[68px] left-0 h-1.5 w-3 bg-[#EEEEEE]" />
          </div>
          <div className="absolute top-1/2 right-0 h-20 w-3 -translate-y-1/2">
            <div className="absolute top-0 right-0 h-1.5 w-3 bg-[#EEEEEE]" />
            <div className="absolute top-[17px] right-0 h-1.5 w-3 bg-[#EEEEEE]" />
            <div className="absolute top-[34px] right-0 h-1.5 w-3 bg-[#EEEEEE]" />
            <div className="absolute top-[51px] right-0 h-1.5 w-3 bg-[#EEEEEE]" />
            <div className="absolute top-[68px] right-0 h-1.5 w-3 bg-[#EEEEEE]" />
          </div>
          <div className="absolute left-1/2 flex h-3 w-20 -translate-x-1/2 items-center gap-3">
            <div className="h-3 w-1.5 self-stretch bg-[#EEEEEE]" />
            <div className="h-3 w-1.5 self-stretch bg-[#EEEEEE]" />
            <div className="h-3 w-1.5 self-stretch bg-[#EEEEEE]" />
            <div className="h-3 w-1.5 self-stretch bg-[#EEEEEE]" />
            <div className="h-3 w-1.5 self-stretch bg-[#EEEEEE]" />
          </div>
          <div className="absolute bottom-0 left-1/2 flex h-3 w-20 -translate-x-1/2 items-center gap-3">
            <div className="h-3 w-1.5 self-stretch bg-[#EEEEEE]" />
            <div className="h-3 w-1.5 self-stretch bg-[#EEEEEE]" />
            <div className="h-3 w-1.5 self-stretch bg-[#EEEEEE]" />
            <div className="h-3 w-1.5 self-stretch bg-[#EEEEEE]" />
            <div className="h-3 w-1.5 self-stretch bg-[#EEEEEE]" />
          </div>
        </div>
        <div className="relative size-28 overflow-hidden rounded-3xl bg-[#D7FF45] shadow-[0px_3.200000047683716px_9.600000381469727px_0px_rgba(0,0,0,0.12)]">
          <div className="absolute top-[-25.60px] left-[26.80px] size-16 rounded-full bg-primary/35 blur-[48px]" />
          <div className="absolute top-[82.38px] left-[-47.20px] h-32 w-5 origin-top-left rotate-[-59.09deg] rounded-full bg-primary/35 blur-[48px]" />
          <div className="absolute top-[-35.30px] left-[113.80px] h-16 w-14 rounded-full bg-white blur-[48px]" />
          <div className="absolute top-[45.60px] left-[63.20px] h-44 w-36 rounded-full bg-primary/20 blur-[160px]" />
        </div>
      </div>
    </div>
  );
};
