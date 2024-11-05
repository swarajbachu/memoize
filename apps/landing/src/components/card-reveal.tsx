"use client";

import Lenis from "@studio-freight/lenis";
import type { MotionValue } from "framer-motion";
import { motion, useScroll, useTransform } from "framer-motion";
import { useEffect, useRef } from "react";

import { cn } from "@memoize/ui";
import { Card, CardContent } from "@memoize/ui/card";

const painPoints = [
  {
    title: "Struggling to Find Time for Self-Reflection?",
    problem:
      "Your busy schedule leaves little room for meaningful reflection and personal growth.",
    solution:
      "With Memoize, you can easily integrate short reflection sessions into your day. Our guided tools help you reflect effectively in just minutes!",
  },
  {
    title: "Feeling Stuck in Your Personal Growth?",
    problem:
      "You want to grow and understand yourself better but don’t know where to start.",
    solution:
      "Memoize offers structured reflection exercises and resources that guide you step-by-step on your journey to self-discovery and improvement.",
  },
  {
    title: "Overwhelmed by Your Thoughts?",
    problem:
      "Managing and organizing your thoughts feels chaotic and unmanageable.",
    solution:
      "Memoize provides intuitive journaling features and mindfulness tools to help you organize your thoughts, reduce stress, and gain clarity.",
  },
  {
    title: "Lacking Motivation for Self-Improvement?",
    problem:
      "It's hard to stay motivated and consistent with your personal growth goals.",
    solution:
      "Memoize offers personalized reminders and progress tracking to keep you motivated and committed to your self-improvement journey.",
  },
  {
    title: "Need Support on Your Growth Journey?",
    problem:
      "You wish to connect with others who are also focused on personal development.",
    solution:
      "Join the Memoize community to share experiences, gain insights, and receive encouragement from like-minded individuals.",
  },
];

export default function CardParalax() {
  const gallery = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: gallery,
    offset: ["start start", "end end"],
  });

  useEffect(() => {
    const lenis = new Lenis();
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    function raf(time: any) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);
  }, []);

  return (
    <section id="solutions" ref={gallery} className="relative  pt-24">
      {/* <div className="hover:dark:bg-[#020202] hover:bg-slate-50 border mx-2 rounded-lg "> */}
      <div className="sticky top-10 z-50 flex h-screen  flex-col items-center">
        <h1 className="mt-10 h-fit text-balance p-3 text-center text-2xl font-medium md:text-4xl">
          Your Problems, Our Solutions
        </h1>
        <p className="font-mono text-balance text-center text-lg">
          scroll down to see more
        </p>
        <div className="absolute inset-x-0 bottom-0 z-50 h-[15vh]  bg-gradient-to-t from-background to-transparent md:h-[30vh]" />
      </div>

      {painPoints.map((item, index) => {
        const targetScale = 1 - (painPoints.length - index - 1) * 0.05;
        return (
          <CardContainer
            key={item.title}
            title={item.title}
            problem={item.problem}
            solution={item.solution}
            index={index}
            targetScale={targetScale}
            progress={scrollYProgress}
          />
        );
      })}
    </section>
  );
}

function CardContainer({
  image,
  title,
  problem,
  solution,
  index,
  targetScale,
  progress,
}: {
  index: number;
  image?: string;
  title: string;
  problem: string;
  solution: string;
  targetScale: number;
  progress: MotionValue<number>;
}) {
  const container = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: container,
    offset: ["start end", "start start"],
  });
  const scale = useTransform(scrollYProgress, [0, 1], [1.5, 1]);
  const range = [index * 0.125, 1];
  const cardScale = useTransform(progress, range, [1, targetScale]);
  const width = typeof window !== "undefined" ? window.innerWidth : 1920;

  return (
    <div
      ref={container}
      className="sticky top-0 flex h-dvh  w-full items-center justify-center pt-40 md:pt-24"
    >
      <motion.div
        className={cn(
          "relative grid  w-full max-w-4xl place-content-center overflow-hidden p-20 px-5 sm:px-8 lg:px-10 ",
        )}
        style={{
          scale: cardScale,
          top: `calc(-5% + ${index * (width < 640 ? 15 : 30)}px)`,
        }}
      >
        <Card className="bg-background relative flex h-[400px] w-full ">
          <div className="absolute right-0 top-0 grid size-16 place-content-center rounded-es-lg rounded-se-lg border-r bg-indigo-700/20 text-indigo-800 sm:h-full sm:w-[30%]  md:relative md:rounded-none md:bg-transparent md:text-card-foreground">
            <h3 className="text-2xl font-medium md:text-3xl">{index + 1}</h3>
          </div>
          <CardContent className="flex flex-col items-start justify-center p-6">
            {/* <motion.div
                className="w-full h-[30vh] md:h-[50vh] aspect-video lg:h-[70vh] rounded-lg "
                style={{
                  scale,
                }}
              > 
              </motion.div> */}
            <h1 className="mb-4 text-left text-xl font-semibold md:text-3xl">
              {title}
            </h1>
            <p className="mb-2 text-left text-lg font-medium md:text-2xl">
              {problem}
            </p>
            <p className="text-left text-lg font-normal md:text-2xl">
              {solution}
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
