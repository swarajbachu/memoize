"use client";
import React, { useEffect, useState } from "react";
import { Container } from "@/components/container";
import { motion, AnimatePresence } from "motion/react";
import { AGENTS } from "@/lib/site";

// The coding agents memoize wraps. We have no logo assets, so render the
// agent names as clean text badges in the marquee row.
const allAgents = AGENTS.map((name, i) => ({ id: i + 1, name }));

const DISPLAY_COUNT = allAgents.length;

export const LogoCloud = () => {
  const [displayedAgents, setDisplayedAgents] = useState(
    allAgents.slice(0, DISPLAY_COUNT),
  );

  // Cycle the entrance animation so the row keeps a subtle life to it, the
  // same cadence as the rotating logo cloud.
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCycle((c) => c + 1);
      setDisplayedAgents((current) => {
        const next = [...current];
        const last = next.pop();
        if (last) next.unshift(last);
        return next;
      });
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return (
    <Container className="max-w-7xl py-20">
      <h2 className="font-dm-mono -tracking-xs text-muted-foreground text-center text-sm leading-4 font-normal uppercase">
        Works with every coding agent
      </h2>

      <div className="mx-auto mt-12 flex max-w-6xl flex-wrap items-center justify-center gap-x-4 gap-y-4 md:gap-x-12 md:gap-y-8">
        {displayedAgents.map((agent, index) => (
          <motion.div
            key={agent.id}
            style={{ perspective: 800 }}
            className="relative transition-all duration-300"
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={`${agent.id}-${cycle}`}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -20, opacity: 0 }}
                transition={{
                  duration: 0.3,
                  delay: index * 0.04,
                  ease: "easeInOut",
                }}
              >
                <span className="bg-card flex items-center rounded-full border border-white/10 px-4 py-1.5 text-sm font-medium whitespace-nowrap text-foreground transition-colors hover:border-primary/40">
                  {agent.name}
                </span>
              </motion.div>
            </AnimatePresence>
          </motion.div>
        ))}
      </div>
    </Container>
  );
};
