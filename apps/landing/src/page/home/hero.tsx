import { Badge } from "@memoize/ui/badge";
import { Button } from "@memoize/ui/button";
import Link from "next/link";
import { BsArrowRight } from "react-icons/bs";
import { RiVerifiedBadgeFill } from "react-icons/ri";
import ConfusionToClarity from "~/components/confusion-to-clarity";
import { GridPattern } from "~/components/grid-pattern";

export default function HeroSection() {
  return (
    <section className="py-40 flex flex-col gap-2 items-center justify-center">
      <Badge className="bg-foreground hover:bg-card-foreground py-1 px-5 rounded-full text-sm">
        Mini Therapist <BsArrowRight className="ml-3 h-4 w-4 rotate-360" />
      </Badge>
      <div className="absolute -z-10 inset-0 [mask-image:radial-gradient(ellipse_at_center,white,transparent)]">
        <GridPattern />
      </div>
      <h1 className="max-w-4xl my-4 text-balance text-3xl mb09 md:text-4xl lg:text-6xl font-bold text-center">
        Start Your Path to Self-Discovery
      </h1>
      {/* <TextHighlighter text="" /> */}
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1">
          <RiVerifiedBadgeFill
            className="h-6 w-5 flex-none text-primary"
            aria-hidden="true"
          />
          Reflect
        </span>
        <span className="flex items-center gap-1">
          <RiVerifiedBadgeFill
            className="h-6 w-5 flex-none text-primary"
            aria-hidden="true"
          />
          Understand
        </span>
        <span className="flex items-center gap-1">
          <RiVerifiedBadgeFill
            className="h-6 w-5 flex-none text-primary"
            aria-hidden="true"
          />
          Grow
        </span>
      </div>
      <div className="flex gap-2 py-3">
        <Button size="lg" className="w-48 h-11" asChild>
          <Link href="https://app.memoize.co/sign-up">Get Started</Link>
        </Button>
        {/* <Button variant="outline" className="w-48 h-11" size="lg">
          Try Demo
        </Button> */}
      </div>
      <ConfusionToClarity />
    </section>
  );
}
