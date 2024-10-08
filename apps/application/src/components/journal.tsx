"use client";

import { Button } from "@memoize/ui/button";
import { ChevronRight } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";

interface Entry {
  question: string;
  answer: string;
}

const questions: string[] = [
  "How are you feeling today?",
  "What's one thing you're grateful for?",
  "What's your main goal for today?",
  // Add more questions as needed
];

export default function JournalingUI(): JSX.Element {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [currentAnswer, setCurrentAnswer] = useState<string>("");
  const containerRef = useRef<HTMLDivElement>(null);
  const currentQuestionRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      adjustTextareaHeight(inputRef.current);
    }
    // Scroll so that the current question is at the top
    if (currentQuestionRef.current) {
      currentQuestionRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [currentQuestionIndex]);

  const adjustTextareaHeight = (element: HTMLTextAreaElement) => {
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCurrentAnswer(e.target.value);
    adjustTextareaHeight(e.target);
  };

  const handleNextQuestion = () => {
    if (currentAnswer.trim() !== "") {
      setEntries([
        { question: questions[currentQuestionIndex], answer: currentAnswer },
        ...entries,
      ]);
      setCurrentAnswer("");
      setCurrentQuestionIndex((prev) =>
        Math.min(prev + 1, questions.length - 1),
      );
    }
  };

  const handleFinish = () => {
    console.log("Journaling session finished", entries);
    // Here you would typically save the entries or perform any final actions
  };

  return (
    <div className="h-screen flex flex-col">
      <div className="flex-grow overflow-auto" ref={containerRef}>
        <div className="max-w-2xl mx-auto p-4 flex flex-col">
          {/* Previous Entries */}
          {entries.map((entry, index) => (
            <div key={index} className="mb-4">
              <p className="font-bold">{entry.question}</p>
              <p className="whitespace-pre-wrap">{entry.answer}</p>
            </div>
          ))}
          {/* Current Question and Text Editor */}
          <div
            ref={currentQuestionRef}
            className="min-h-screen flex flex-col justify-start"
          >
            <p className="font-bold">{questions[currentQuestionIndex]}</p>
            <textarea
              ref={inputRef}
              value={currentAnswer}
              onChange={handleInputChange}
              className="w-full bg-transparent resize-none outline-none overflow-hidden"
              rows={1}
              placeholder="Start typing your answer here..."
            />
          </div>
        </div>
      </div>
      <div className="p-4 flex justify-between">
        <Button
          onClick={handleNextQuestion}
          disabled={currentAnswer.trim() === ""}
        >
          Next <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
        <Button onClick={handleFinish} variant="outline">
          Finish Entry
        </Button>
      </div>
    </div>
  );
}
