import { forwardRef } from "react";

import { cn } from "@/lib/utils";

export const FeedbacksCard = forwardRef<
  HTMLDivElement,
  {
    item: {
      name: string;
      role: string;
      quote: string;
      label: string;
    };
  }
>(function FeedbacksCard({ item }, ref) {
  return (
    <div
      ref={ref}
      className="bg-natural-black text-natural-white relative flex min-h-full w-full shrink-0 flex-col gap-30 overflow-hidden rounded-3xl p-8 lg:w-170"
    >
      <div
        className={cn(
          "absolute inset-0",
          "bg-[linear-gradient(to_right,#24272A_1px,transparent_1px),linear-gradient(to_bottom,#24272A_1px,transparent_1px)] bg-size-[44px_44px]",
          "mask-[radial-gradient(circle,black_10%,transparent_100%)]",
        )}
      />
      <div className="absolute inset-0">
        <div className="relative h-full w-full">
          <div className="absolute top-0 left-0 h-48 w-44 -translate-x-1/2 -translate-y-1/2">
            <div className="absolute top-5 left-20 h-48 w-28 rounded-full bg-[#15171A] blur-2xl" />
            <div className="absolute top-11.25 left-10 size-20 rounded-full bg-white blur-[34px]" />
          </div>
        </div>
      </div>

      <div className="relative z-10">
        <span className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-primary-foreground">
          {item.label}
        </span>
      </div>
      <div className="relative z-10 flex flex-col gap-8">
        <span className="text-lg leading-6.5 font-medium">{item.quote}</span>
        <div className="flex gap-2 text-base leading-6 font-medium">
          <span>{item.name}</span>
          <span className="text-muted-foreground">{item.role}</span>
        </div>
      </div>
    </div>
  );
});
