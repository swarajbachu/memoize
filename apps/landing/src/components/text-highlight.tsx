"use client";

import { motion } from "framer-motion";

export default function TextHighlighter({
  text = "This is a natural text highlighting effect.",
}: {
  text?: string;
}) {
  return (
    <div className="relative inline-flex h-14 font-medium items-center">
      <h2 className="max-w-2xl  text-2xl md:text-3xl lg:text-5xl font-bold text-center">
        {text}
      </h2>
      <motion.div
        className="absolute bottom-0 -left-[5%] h-full bg-primary/25 rounded-sm opacity-70"
        initial={{ width: "0%" }}
        animate={{
          width: "110%",
          transition: {
            delay: 1,
            duration: 2,
            type: "spring",
            stiffness: 50,
            damping: 20,
          },
        }}
      />
      <motion.div
        className="absolute bottom-0 right-0 w-1 h-14 bg-gray-800"
        initial={{ left: "-5%" }}
        animate={{
          left: "105%",
          opacity: [0, 1, 0],
        }}
        transition={{
          delay: 1,
          duration: 2,
          type: "spring",
          stiffness: 50,
          damping: 20,
          opacity: {
            repeat: Number.POSITIVE_INFINITY,
          },
        }}
      />
    </div>
  );
}
