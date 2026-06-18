import { forwardRef } from "react";

import { Testimonial } from "@/components/testimonials";
import { QuoteIcon } from "@/components/icons/general";

export const TestimonialsCard = forwardRef<HTMLDivElement, Testimonial>(function TestimonialsCard(
  { author, quote, workflow },
  ref,
) {
  return (
    <div ref={ref} className="bg-card shadow-card-lg flex min-h-full w-full shrink-0 flex-col items-start justify-start gap-12 overflow-hidden rounded-3xl border border-white/10 px-8 pt-8 pb-6 md:w-147">
      <div className="flex w-full items-center justify-between">
        <span className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-primary-foreground">
          {workflow}
        </span>
        <QuoteIcon />
      </div>
      <div className="flex h-full flex-col items-start justify-between gap-8">
        <div className="flex flex-col items-start justify-start gap-6 self-stretch">
          <div className="text-foreground text-lg leading-6 font-medium">
            {quote}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex size-12 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm font-semibold text-foreground">
            {author.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="text-foreground text-base leading-6 font-medium">
              {author.name}
            </div>
            <div className="text-muted-foreground text-base leading-6 font-medium">
              {author.title}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
