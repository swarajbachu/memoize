"use client";

import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";

export default function Component() {
  const [activeQuestions, setActiveQuestions] = useState<
    Array<{ id: number; text: string }>
  >([]);
  const [clarityItems, setClarityItems] = useState<
    Array<{ id: number; text: string }>
  >([]);
  const [idCounter, setIdCounter] = useState(0);

  const questions = [
    "What?",
    "How?",
    "Why?",
    "When?",
    "Where?",
    "Who?",
    "Which?",
    "Can I?",
    "Should we?",
    "Is it possible?",
  ];

  const clarityOptions = [
    "Understanding gained",
    "Solution found",
    "Action plan created",
    "Insight discovered",
    "Strategy developed",
  ];

  const generateId = useCallback(() => {
    setIdCounter((prev) => prev + 1);
    return idCounter;
  }, [idCounter]);

  const addQuestion = useCallback(() => {
    const newQuestion = questions[Math.floor(Math.random() * questions.length)];
    const newQuestionTwo =
      questions[Math.floor(Math.random() * questions.length)];
    if (!newQuestion || !newQuestionTwo) return;
    setActiveQuestions((prev) => [
      ...prev,
      { id: generateId(), text: newQuestion },
      { id: generateId(), text: newQuestionTwo },
    ]);

    if (Math.random() < 0.3) {
      const newClarity =
        clarityOptions[Math.floor(Math.random() * clarityOptions.length)];
      if (!newClarity) return;
      setClarityItems((prev) => [
        ...prev,
        { id: generateId(), text: newClarity },
      ]);
    }
  }, [generateId]);

  useEffect(() => {
    const interval = setInterval(addQuestion, 2000);
    return () => clearInterval(interval);
  }, [addQuestion]);

  return (
    <div className="relative w-full h-screen  overflow-hidden">
      {/* Background gradient */}

      {/* Logo in the center */}
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20">
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            transition: {
              duration: 4,
              repeat: Number.POSITIVE_INFINITY,
            },
          }}
          transition={{
            duration: 2,
            type: "spring",
            stiffness: 50,
            damping: 20,
          }}
          className="bg-primary w-40 h-40  rounded-full flex items-center justify-center z-20"
        >
          <Image src="/logo.png" alt="logo" width={100} height={100} />
        </motion.div>
      </div>

      {/* Confusion questions */}
      <AnimatePresence>
        {activeQuestions.map(({ id, text }) => (
          <motion.div
            key={id}
            className="absolute  top-1/2 bg-white p-4 rounded-lg shadow-md z-10"
            initial={{
              x: "-10vw",
              y: Math.random() * 300 - 100,
              opacity: 0,
              scale: 1,
            }}
            animate={{
              x: "50vw",
              y: 0,
              opacity: 1,
              scale: 0.2,
            }}
            exit={{ opacity: 0, scale: 0 }}
            transition={{
              type: "spring",
              stiffness: 50,
              damping: 20,
              duration: 4,
              y: {
                delay: 1,
                duration: 3,
              },
              x: {
                duration: 4,
              },
              scale: {
                delay: 2.5,
                duration: 1,
              },
              opacity: {
                duration: 0.2,
              },
            }}
            onAnimationComplete={(definition) => {
              if (definition === "animate") {
                setActiveQuestions((prev) => prev.filter((q) => q.id !== id));
              }
            }}
          >
            {text}
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Clarity items */}
      <AnimatePresence mode="wait">
        {clarityItems.map(({ id, text }) => (
          <motion.div
            key={id}
            className="absolute left-1/2 top-1/2  bg-green-200 p-6 rounded-lg shadow-md max-w-sm z-10"
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.5 }}
            animate={{
              x: "60vw",
              y: Math.random() * 200 - 100,
              opacity: 1,
              scale: 1,
              transition: {
                duration: 4,
              },
            }}
            exit={{
              x: "110vw",
              opacity: 0,
              scale: 5.5,
            }}
            transition={{
              duration: 4,
              type: "spring",
              stiffness: 50,
              scale: {
                duration: 3.5,
              },
            }}
            onAnimationComplete={(definition) => {
              if (definition === "animate") {
                setClarityItems((prev) => prev.filter((c) => c.id !== id));
              }
            }}
          >
            <h3 className="text-xl font-bold mb-2">Clarity Achieved</h3>
            <p>{text}</p>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Accessibility: Hidden description for screen readers */}
      <div className="sr-only">
        Animation depicting the continuous transformation of confusion into
        clarity. Questions randomly appear from the left side, move towards a
        central circular logo labeled 'Process', gradually shrinking as they
        approach the center, then disappear. Clarity items emerge from the
        center, expand as they move to the right side, and continue moving
        off-screen, representing the ongoing process of gaining understanding.
        The background transitions from a blue overlay on the left to clear on
        the right.
      </div>
    </div>
  );
}
