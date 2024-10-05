"use client";

import {
  type MotionValue,
  motion,
  useScroll,
  useTransform,
} from "framer-motion";
import { useRef } from "react";

const thoughts = [
  "Brainstorm",
  "Innovate",
  "Create",
  "Inspire",
  "Connect",
  "Imagine",
];

export default function Component() {
  const containerRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    // offset: ["start start", "end start"],
  });

  return (
    <div
      ref={containerRef}
      className="min-h-[200vh] bg-gradient-to-b from-blue-50 to-purple-50 relative overflow-hidden"
    >
      <section className="h-screen w-screen flex items-center justify-center">
        <h1 className="text-4xl md:text-6xl font-bold text-blue-800 mb-4 text-center">
          Thought Organizer
        </h1>
      </section>

      <section className="min-h-screen w-screen p-8">
        <div className="grid grid-cols-3 gap-8 max-w-6xl mx-auto">
          {thoughts.map((thought, index) => (
            <StickyNote
              key={thought}
              index={index}
              scrollYProgress={scrollYProgress}
            >
              {thought}
            </StickyNote>
          ))}
        </div>
      </section>
    </div>
  );
}

function StickyNote({
  children,
  index,
  scrollYProgress,
}: {
  children: React.ReactNode;
  index: number;
  scrollYProgress: MotionValue<number>;
}) {
  const initialXOffset = Math.random() * 40 - 20;
  const initialYOffset = -100 - index * 100;
  const initialRotation = Math.random() * 20 - 10;

  const x = useTransform(scrollYProgress, [0, 1], [initialXOffset, 0]);
  const y = useTransform(scrollYProgress, [0, 1], [initialYOffset, 0]);
  const rotate = useTransform(scrollYProgress, [0, 1], [initialRotation, 0]);

  return (
    <motion.div
      className="aspect-square bg-yellow-200 shadow-md p-4 text-center flex items-center justify-center cursor-pointer hover:scale-105 transition-transform"
      style={{
        boxShadow: "5px 5px 15px rgba(0,0,0,0.1)",
        borderRadius: "2px 15px 2px 15px",
        x,
        y,
        rotate,
      }}
    >
      <span className="text-gray-800 font-handwriting text-xl">{children}</span>
    </motion.div>
  );
}
