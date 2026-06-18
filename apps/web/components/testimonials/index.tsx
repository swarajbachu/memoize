"use client";

import { Container } from "@/components/container";
import { Header } from "@/components/header";
import { Button } from "@/components/button";
import { TestimonialsCard } from "@/components/testimonials/card";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface Testimonial {
  author: {
    name: string;
    title: string;
  };
  quote: string;
  workflow: string;
}

const data: Testimonial[] = [
  {
    author: {
      name: "Staff engineer",
      title: "Claude + Codex workflow",
    },
    quote:
      "I run Claude Code and Codex side by side on the same repo now. Each chat gets its own worktree, so the agents never step on each other.",
    workflow: "parallel agents",
  },
  {
    author: {
      name: "Founder / CTO",
      title: "Local-first workflow",
    },
    quote:
      "It's my keys and my machine. SQLite locally, tokens in the Keychain, nothing routed through someone else's server. That was the whole sell for me.",
    workflow: "local-first",
  },
  {
    author: {
      name: "Backend lead",
      title: "Review workflow",
    },
    quote:
      "The chat timeline reads like a real log: tool calls, diffs, errors, all inline. I stopped squinting at a raw terminal a week in.",
    workflow: "review flow",
  },
  {
    author: {
      name: "Product engineer",
      title: "Provider switching",
    },
    quote:
      "Switching providers used to mean a new window and a new mental model. Here I just pick the agent and keep going in the same workspace.",
    workflow: "provider switch",
  },
  {
    author: {
      name: "Infrastructure engineer",
      title: "Permissions workflow",
    },
    quote:
      "No more juggling five terminal tabs. One project-aware app, every agent CLI, and the permission prompts actually make sense.",
    workflow: "permissions",
  },
];

export const Testimonials = () => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [slideDistance, setSlideDistance] = useState(0);
  const firstCardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const updateSlideDistance = () => {
      if (!firstCardRef.current) {
        return;
      }

      const cardWidth = firstCardRef.current.getBoundingClientRect().width;
      setSlideDistance(cardWidth + 24);
    };

    updateSlideDistance();

    const resizeObserver = new ResizeObserver(updateSlideDistance);

    if (firstCardRef.current) {
      resizeObserver.observe(firstCardRef.current);
    }

    window.addEventListener("resize", updateSlideDistance);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateSlideDistance);
    };
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setActiveIndex((currentIndex) => (currentIndex + 1) % data.length);
    }, 4000);

    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <section className="w-full">
      <Container className="relative flex flex-col gap-15 py-20 md:py-30 lg:gap-20">
        <div className="flex flex-col items-center justify-between gap-8 md:items-start lg:flex-row lg:items-center">
          <Header className="text-center md:text-left">
            What developers say about memoize
          </Header>
          <Button />
        </div>
        <div className="flex flex-col gap-10">
          <div className="_overflow-hidden">
            <div
              className="flex gap-6 transition-transform duration-500 ease-out will-change-transform"
              style={{
                transform: `translate3d(-${activeIndex * slideDistance}px, 0, 0)`,
              }}
            >
              {data.map((testimonial, index) => (
                <TestimonialsCard
                  key={index}
                  ref={index === 0 ? firstCardRef : undefined}
                  {...testimonial}
                />
              ))}
            </div>
          </div>
          {/* dots */}
          <div className="flex w-full items-center justify-center">
            <div className="bg-card shadow-card-lg mx-auto flex h-fit w-fit items-center justify-center gap-3 rounded-full border border-white/10 px-4 py-3">
              {data.map((_, index) => (
                <button
                  key={index}
                  type="button"
                  aria-label={`Show testimonial ${index + 1}`}
                  aria-current={activeIndex === index}
                  onClick={() => setActiveIndex(index)}
                  className={cn(
                    "size-2 cursor-pointer rounded-full transition-all duration-300",
                    activeIndex === index
                      ? "bg-primary"
                      : "bg-white/15 hover:bg-white/30",
                  )}
                />
              ))}
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
};
