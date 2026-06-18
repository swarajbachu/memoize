"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  ChevronRightIcon,
  FlashIcon,
  MicIcon,
} from "@/components/icons/general";
import { RoundedGridPattern } from "@/components/bento-one/cards/rounded-grid-pattern";
import { motion } from "motion/react";

const searchQuery = "/plan refactor the auth flow in @lib/auth.ts";
const typingFrames = Array.from(
  { length: searchQuery.length + 1 },
  (_, index) => `${index*0.8}ch`,
);
const typingTimes = Array.from(
  { length: searchQuery.length + 1 },
  (_, index) => index / searchQuery.length,
);

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: "easeOut" as const },
  },
} as const;

const resultStackVariants = {
  hidden: {},
  visible: {
    transition: {
      delayChildren: 0.1,
      staggerChildren: 0.14,
    },
  },
} as const;

export const GetFoundOnGoogle = () => {
  const [resultsVisible, setResultsVisible] = useState(false);

  return (
    <div className="relative flex h-full flex-col gap-10">
      <div className="absolute inset-0 translate-x-5">
        <RoundedGridPattern />
      </div>
      <div className="z-10 justify-start text-lg leading-6 font-medium text-foreground">
        A composer that speaks code
      </div>
      <div className="z-10 flex flex-col gap-2">
        {/* google search bar */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.35 }}
          variants={fadeUp}
          className="bg-secondary shadow-card-md flex w-96 flex-col items-start justify-start gap-4 rounded-full border border-white/10 py-3.5"
        >
          <div className="inline-flex items-center justify-start self-stretch px-4">
            <div className="flex flex-1 items-center justify-between">
              <div className="relative flex items-center justify-start gap-3">
                <span className="text-primary font-mono text-sm">{">"}</span>
                <div className="relative flex items-center">
                  <motion.div
                    className="text-muted-foreground overflow-hidden text-sm leading-4 font-normal whitespace-nowrap"
                    initial={{ width: 0 }}
                    animate={{ width: typingFrames }}
                    transition={{
                      duration: 2.15,
                      ease: "linear",
                      times: typingTimes,
                    }}
                    onAnimationComplete={() => setResultsVisible(true)}
                  >
                    {searchQuery}
                  </motion.div>
                  {!resultsVisible && (
                    <motion.div
                      aria-hidden="true"
                      className="bg-muted-foreground absolute top-0 -right-2 h-4 w-px origin-top-left"
                      animate={{
                        opacity: [0, 1, 1, 0],
                        scaleY: [0.85, 1, 0.85],
                      }}
                      transition={{
                        duration: 0.9,
                        repeat: Infinity,
                        repeatDelay: 0.08,
                        ease: "linear",
                      }}
                    />
                  )}
                </div>
              </div>
              <MicIcon className="text-muted-foreground" />
            </div>
          </div>
        </motion.div>
        {/* search results catd */}
        <div
          className={cn(
            "relative h-[calc(var(--box-min-height)-100px)] w-96",
            "mask-[linear-gradient(0deg,rgba(255,255,255,0)_0%,rgba(255,255,255,1)_50%)]",
          )}
        >
          <motion.div
            initial="hidden"
            animate={resultsVisible ? "visible" : "hidden"}
            variants={resultStackVariants}
            className="relative h-full"
          >
            <motion.div
              variants={{
                hidden: { opacity: 0, y: 18, scale: 0.98 },
                visible: {
                  opacity: 1,
                  y: 0,
                  scale: 1,
                  transition: { duration: 0.5, ease: "easeOut" },
                },
              }}
              className="shadow-card-md absolute top-16.5 left-1/2 h-24 w-72 -translate-x-1/2 rounded-xl bg-secondary border border-white/10 px-2.5 py-3"
            />
            <motion.div
              variants={{
                hidden: { opacity: 0, y: 18, scale: 0.98 },
                visible: {
                  opacity: 1,
                  y: 0,
                  scale: 1,
                  transition: { duration: 0.5, ease: "easeOut" },
                },
              }}
              className="shadow-card-md absolute top-9 left-1/2 h-28 w-80 -translate-x-1/2 rounded-2xl bg-secondary border border-white/10 px-2.5 py-3"
            />
            <motion.div
              variants={{
                hidden: { opacity: 0, y: 18, scale: 0.98 },
                visible: {
                  opacity: 1,
                  y: 0,
                  scale: 1,
                  transition: { duration: 0.55, ease: "easeOut" },
                },
              }}
              className="shadow-card-md absolute top-0 left-0 inline-flex w-96 flex-col items-start justify-center gap-3 rounded-2xl border border-white/10 bg-secondary px-3 py-3.5"
            >
              <div className="inline-flex items-center justify-start gap-3">
                <div className="overflow-hidden">
                  <FlashIcon className="size-8 text-primary" />
                </div>
                <div className="inline-flex flex-col items-start justify-center gap-1">
                  <div className="justify-start text-center text-sm leading-4 font-normal text-foreground">
                    /plan
                  </div>
                  <div className="inline-flex items-center justify-start gap-1">
                    <div className="justify-start text-center text-xs leading-3 font-normal text-muted-foreground">
                      slash command
                    </div>
                    <ChevronRightIcon />
                    <div className="justify-start text-center text-xs leading-3 font-normal text-muted-foreground">
                      @mention
                    </div>
                    <ChevronRightIcon />
                    <div className="justify-start text-center text-xs leading-3 font-normal text-muted-foreground">
                      attach
                    </div>
                  </div>
                </div>
              </div>
              <div className="justify-start text-center text-sm leading-4 font-normal text-foreground">
                Draft a plan before any edits land
              </div>
              <div className="flex flex-col items-start justify-start gap-1.5">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: "320px" }}
                  transition={{ duration: 0.5, delay: 1 }}
                  className="h-2.5 rounded-[99px] bg-white/10"
                />
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: "192px" }}
                  transition={{ duration: 0.5, delay: 1.2 }}
                  className="h-2.5 rounded-[99px] bg-white/10"
                />
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

