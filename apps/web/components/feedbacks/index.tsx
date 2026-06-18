"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/button";
import { Container } from "@/components/container";
import { Header } from "@/components/header";
import { FeedbacksCard } from "@/components/feedbacks/feedbacks-card";

const data = [
  {
    quote:
      "“Sub-agent delegation is the feature I didn't know I needed. The lead agent farms out the boring work to a cheaper model and my bill dropped without me babysitting it.”",
    name: "Principal engineer",
    role: "Sub-agent workflow",
    label: "delegation",
  },
  {
    quote:
      "“Plan mode plus the @-mention file picker means I scope the change before any code is touched. Way fewer wrong turns than pasting paths into a terminal.”",
    name: "Full-stack developer",
    role: "Plan mode workflow",
    label: "plan mode",
  },
  {
    quote:
      "“I attach a screenshot of the failing UI, drop it in the composer, and the agent just picks it up. Image and PDF attachments turned out to be a daily thing.”",
    name: "Frontend engineer",
    role: "Attachment workflow",
    label: "attachments",
  },
  {
    quote:
      "“Per-session permission overrides let me loosen things up for a throwaway spike and lock them right back down. The smart policy gets the defaults right.”",
    name: "Platform engineer",
    role: "Permission workflow",
    label: "permissions",
  },
  {
    quote:
      "“It's free, it's macOS native, and it runs on my M-series and an old Intel mini both. Installed it during the alpha and it became my default the same afternoon.”",
    name: "Indie developer",
    role: "Alpha workflow",
    label: "macOS alpha",
  },
];

export const Feedbacks = () => {
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
    <section className="w-full overflow-hidden">
      <Container className="flex flex-col gap-15 py-20 md:py-30">
        <div className="flex flex-col gap-6 md:flex-row md:justify-between">
          <Header>More from the build logs</Header>
          <div>
            <Button />
          </div>
        </div>
        <div className="flex flex-col gap-10">
          <div>
            <div
              className="flex transition-transform duration-500 ease-out will-change-transform gap-6"
              style={{
                transform: `translate3d(-${activeIndex * slideDistance}px, 0, 0)`,
              }}
            >
              {data.map((item, index) => (
                <FeedbacksCard
                  key={index}
                  ref={index === 0 ? firstCardRef : undefined}
                  item={item}
                />
              ))}
            </div>
          </div>
          <div className="flex w-full items-center justify-center">
            <div className="bg-card shadow-card-lg mx-auto flex h-fit w-fit items-center justify-center gap-3 rounded-full border border-white/10 px-4 py-3">
              {data.map((_, index) => (
                <button
                  key={index}
                  type="button"
                  aria-label={`Show feedback ${index + 1}`}
                  aria-current={activeIndex === index}
                  onClick={() => setActiveIndex(index)}
                  className={`cursor-pointer size-2 rounded-full transition-all duration-300 ${
                    activeIndex === index
                      ? "bg-primary"
                      : "bg-white/15 hover:bg-white/30"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
};
