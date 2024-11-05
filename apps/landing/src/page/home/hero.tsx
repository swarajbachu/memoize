import { Badge } from "@memoize/ui/badge";
import { Button } from "@memoize/ui/button";
import { RiVerifiedBadgeFill } from "react-icons/ri";
import ConfusionToClarity from "~/components/confusion-to-clarity";
import TextHighlighter from "~/components/text-highlight";

export default function HeroSection() {
  return (
    <section className="min-h-screen flex flex-col gap-2 items-center justify-center">
      <Badge className="bg-foreground hover:bg-card-foreground py-1 px-5 rounded-xl text-sm">
        Mini Therapist
      </Badge>
      <h1 className="max-w-2xl text-2xl mb09 md:text-3xl lg:text-5xl font-bold text-center">
        Start Your Path to
      </h1>
      <TextHighlighter text="Self-Discovery" />
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
        <Button size="lg" className="w-48 h-11">
          Get Started
        </Button>
        <Button variant="outline" className="w-48 h-11" size="lg">
          Try Demo
        </Button>
      </div>
      <ConfusionToClarity />
    </section>
  );
}
