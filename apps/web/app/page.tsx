import { getSEO } from "@/lib/seo";
import { AboutSection } from "@/components/about";
import { BentoOne } from "@/components/bento-one";
import { Comparison } from "@/components/comparison";
import { FAQ } from "@/components/faq";
import { Hero } from "@/components/hero";
import { LogoCloud } from "@/components/logo-cloud";
import { Projects } from "@/components/projects";

export const metadata = getSEO({
  title: "Token max every coding agent",
  description:
    "memoize is a local-first macOS workspace for developers who want to code all day, max out their AI subscriptions, and ship more parallel attempts safely.",
  path: "/",
});

export default function Home() {
  return (
    <section className="flex max-w-screen overflow-x-hidden flex-col items-center justify-center">
      <Hero />
      <LogoCloud />
      <BentoOne />
      <Projects />
      <Comparison />
      <AboutSection />
      <FAQ />
    </section>
  );
}
