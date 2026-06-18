import { cn } from "@/lib/utils";
import { Container } from "@/components/container";
import { Header } from "@/components/header";
import { CtaCard } from "@/components/bento-two/cards/cta-card";
import { Metrics } from "@/components/bento-two/cards/metrics";
import { BrandsMarquee } from "@/components/bento-two/cards/brands-marquee";
import { BottomMarquee } from "@/components/bento-two/cards/bottom-marquee";
import { Quotes } from "@/components/bento-two/cards/quotes";

export const BentoTwo = ({ disabelHeader = false }: { disabelHeader?: boolean }) => {
  return (
    <section className="w-full">
      <Container className="flex flex-col gap-15 py-20 md:py-30">
        {!disabelHeader && <Header>Built for developers who ship with agents</Header>}
        <div
          className={cn(
            "flex min-h-140 w-full flex-col-reverse gap-3 lg:grid lg:grid-cols-3",
            "**:data-[slot=card]:bg-card **:data-[slot=card]:border **:data-[slot=card]:border-white/10 **:data-[slot=card]:relative **:data-[slot=card]:overflow-hidden **:data-[slot=card]:rounded-2xl",
          )}
        >
          <div data-slot="card" className="h-140 lg:h-full">
            <CtaCard />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:col-span-2 lg:grid-cols-2 lg:grid-rows-4">
            <div
              data-slot="card"
              className="row-span-1 md:row-span-3 md:min-h-105 lg:min-h-0"
            >
              <Metrics />
            </div>
            <div
              data-slot="card"
              className="row-span-1 h-20 md:row-span-1 md:h-full"
            >
              <BrandsMarquee />
            </div>
            <div data-slot="card" className="row-span-1 md:row-span-2">
              <Quotes />
            </div>
            <div
              data-slot="card"
              className="col-span-1 min-h-20 md:col-span-2 md:h-full lg:min-h-0"
            >
              <BottomMarquee />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
};

