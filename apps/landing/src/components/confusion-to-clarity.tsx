"use client";

import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import React from "react";
import { useCallback, useEffect, useState } from "react";

const AnalysisComponent = ({ text }: { text: string }) => (
  <div className="bg-blue-100 p-4 rounded-lg shadow-md">
    <h3 className="text-lg font-semibold mb-2">Analysis</h3>
    <p>{text}</p>
  </div>
);

const TodoComponent = ({ task }: { task: string }) => (
  <div className="bg-green-100 p-4 rounded-lg shadow-md">
    <h3 className="text-lg font-semibold mb-2">Todo</h3>
    <label className="flex items-center space-x-2">
      <input type="checkbox" className="form-checkbox" />
      <span>{task}</span>
    </label>
  </div>
);

const FeelingComponent = ({
  feeling,
  emoji,
}: {
  feeling: string;
  emoji: string;
}) => (
  <div className="bg-yellow-100 p-4 rounded-lg shadow-md">
    <h3 className="text-lg font-semibold mb-2">Feeling</h3>
    <p>
      {feeling} {emoji}
    </p>
  </div>
);

export default function ConfusionToClarity() {
  const [activeThoughts, setActiveThoughts] = useState<
    Array<{ id: number; text: string }>
  >([]);
  const [reflectionOutcomes, setReflectionOutcomes] = useState<
    Array<{ id: number; type: string; content: string; emoji?: string }>
  >([]);
  const [idCounter, setIdCounter] = useState(0);
  const sectionRef = React.useRef<HTMLDivElement>(null);
  const [isActive, setIsActive] = useState(false);

  const thoughts = [
    "What's really bothering me today?",
    "How can I improve my work-life balance?",
    "Why do I feel so stressed lately?",
    "When was the last time I felt truly happy?",
    "Where do I see myself in five years?",
    "Who are the most important people in my life?",
    "Which of my habits are holding me back?",
    "Can I find more meaning in my daily routine?",
    "Should I be setting different goals for myself?",
    "Is it possible to change my negative thought patterns?",
    "How can I be more present in my relationships?",
    "What small step can I take today to improve my situation?",
    "Am I taking care of my physical and mental health?",
    "How can I better manage my time and priorities?",
    "What are my core values, and am I living by them?",
  ];

  const reflectionOptions = [
    {
      type: "analysis",
      content: "My perfectionism is causing unnecessary stress",
    },
    { type: "todo", content: "Practice mindfulness for 10 minutes daily" },
    { type: "feeling", content: "More self-aware", emoji: "🧠" },
    {
      type: "analysis",
      content: "I need to communicate my feelings more openly",
    },
    { type: "todo", content: "Schedule regular breaks during work hours" },
    { type: "feeling", content: "Empowered", emoji: "💪" },
    {
      type: "analysis",
      content: "My current routine isn't aligned with my long-term goals",
    },
    { type: "todo", content: "Create a daily gratitude journal" },
    { type: "feeling", content: "Hopeful", emoji: "🌟" },
    {
      type: "analysis",
      content: "I'm neglecting my physical health due to work pressure",
    },
    {
      type: "todo",
      content: "Reach out to a friend I haven't spoken to in a while",
    },
    { type: "feeling", content: "Determined", emoji: "🔥" },
  ];

  const generateId = useCallback(() => {
    setIdCounter((prev) => prev + 1);
    return idCounter;
  }, [idCounter]);

  const addThought = useCallback(() => {
    if (!isActive) return;
    const newThought = thoughts[Math.floor(Math.random() * thoughts.length)];
    if (!newThought) return;
    setActiveThoughts((prev) => [
      ...prev,
      { id: generateId(), text: newThought },
    ]);

    if (Math.random() < 0.4) {
      const newReflection =
        reflectionOptions[Math.floor(Math.random() * reflectionOptions.length)];
      if (!newReflection) return;
      setReflectionOutcomes((prev) => [
        ...prev,
        { id: generateId(), ...newReflection },
      ]);
    }
  }, [generateId, isActive]);

  useEffect(() => {
    const interval = setInterval(addThought, 2000);
    return () => clearInterval(interval);
  }, [addThought]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsActive(entry?.isIntersecting ?? false);
      },
      { threshold: 0.1 }, // Trigger when 10% of the section is visible
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => {
      if (sectionRef.current) {
        observer.unobserve(sectionRef.current);
      }
    };
  }, []);

  return (
    <div ref={sectionRef} className="relative w-full h-[30vh] overflow-hidden">
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
          className="bg-primary w-40 h-40 rounded-full flex items-center justify-center z-20"
        >
          <Image
            src="/logo.png"
            alt="logo"
            width={100}
            height={100}
            className="invert"
          />
        </motion.div>
      </div>

      <AnimatePresence>
        {activeThoughts.map(({ id, text }) => (
          <motion.div
            key={id}
            className="absolute top-1/2 z-10"
            initial={{
              x: "-10vw",
              y: Math.random() * 200 - 150,
              opacity: 0,
              scale: 1,
            }}
            animate={{
              x: "40vw",
              y: -20,
              opacity: 1,
              scale: 0,
            }}
            exit={{ opacity: 0, scale: 0 }}
            transition={{
              duration: 4,
              y: {
                delay: 3,
                duration: 3,
              },
              x: {
                duration: 6,
              },
              scale: {
                type: "spring",
                stiffness: 50,
                damping: 20,
                delay: 5,
                duration: 0.5,
              },
              opacity: {
                duration: 0.2,
              },
            }}
            onAnimationComplete={(definition) => {
              setActiveThoughts((prev) => prev.filter((q) => q.id !== id));
              console.log(activeThoughts, "active");
            }}
          >
            <div className="relative max-w-[255px] bg-[#e5e5ea] text-black p-[10px_20px] rounded-[25px] leading-6 word-wrap-break-word">
              {text}
              <div className="absolute left-[-7px] bottom-0 w-5 h-[25px] bg-[#e5e5ea] rounded-br-[16px_14px]" />
              <div className="absolute left-[-26px] bottom-0 w-[26px] h-[25px] bg-card rounded-br-[10px]" />
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      <AnimatePresence>
        {reflectionOutcomes.map(({ id, type, content, emoji }) => (
          <motion.div
            key={id}
            className="absolute left-1/2 top-1/2 max-w-sm z-10"
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.5 }}
            animate={{
              x: "60vw",
              y: Math.random() * 200 - 100,
              opacity: 1,
              scale: 1,
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
              x: {
                duration: 8,
              },
              y: {
                duration: 8,
              },
              scale: {
                duration: 4,
              },
              opacity: {
                duration: 1,
              },
            }}
            onAnimationComplete={(definition) => {
              if (definition === "animate") {
                setReflectionOutcomes((prev) =>
                  prev.filter((c) => c.id !== id),
                );
              }
            }}
          >
            {type === "analysis" && <AnalysisComponent text={content} />}
            {type === "todo" && <TodoComponent task={content} />}
            {type === "feeling" && (
              <FeelingComponent feeling={content} emoji={emoji || ""} />
            )}
          </motion.div>
        ))}
      </AnimatePresence>

      <div className="sr-only">
        Animation depicting the continuous transformation of thoughts into
        insights during a mini therapy session. Thought bubbles randomly appear
        from the left side, move towards the center, gradually shrinking as they
        approach, then disappear. Analysis insights, todo items, and feeling
        reflections emerge from the center, expand as they move to the right
        side, and continue moving off-screen, representing the ongoing process
        of self-reflection and personal growth.
      </div>
    </div>
  );
}
