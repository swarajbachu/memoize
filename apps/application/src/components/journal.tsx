"use client";

import { Button } from "@memoize/ui/button";
import { ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@memoize/ui";

interface Entry {
  question: string;
  answer: string;
}

const questions: string[] = [
  "How are you feeling today?",
  "What's one thing you're grateful for?",
  "What's your main goal for today?",
  "Describe a recent challenge you overcame.",
  "What's something you're looking forward to?",
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
        {
          question: questions[currentQuestionIndex] ?? "",
          answer: currentAnswer,
        },
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault();
      handleNextQuestion();
    }
  };

  return (
    <div className="h-[97dvh] flex flex-col bg-background text-foreground">
      <div className="flex-grow overflow-auto" ref={containerRef}>
        <div className="max-w-2xl mx-auto p-6 flex flex-col">
          {/* Previous Entries */}
          {entries.map((entry, index) => (
            <div
              key={entry.question}
              className={cn(
                "mb-8 transition-opacity duration-500",
                index === 0 ? "opacity-50" : "opacity-30",
              )}
            >
              <p className="font-semibold text-lg mb-2">{entry.question}</p>
              <p className="whitespace-pre-wrap text-muted-foreground">
                {entry.answer}
              </p>
            </div>
          ))}
          {/* Current Question and Text Editor */}
          <div
            ref={currentQuestionRef}
            className="min-h-[calc(100vh-28rem)] flex flex-col justify-start"
          >
            <p className="font-bold text-2xl mb-4">
              {questions[currentQuestionIndex]}
            </p>
            <textarea
              ref={inputRef}
              value={currentAnswer}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              className="w-full bg-transparent resize-none outline-none overflow-hidden text-lg"
              rows={1}
              placeholder="Start typing your answer here..."
            />
          </div>
        </div>
      </div>
      <div className="p-6 flex justify-between items-center border-t">
        <p className="text-sm text-muted-foreground">
          Press Ctrl + Enter for next question
        </p>
        <div className="space-x-4">
          <Button
            onClick={handleNextQuestion}
            disabled={currentAnswer.trim() === ""}
            className="px-6"
          >
            Next <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
          <Button onClick={handleFinish} variant="outline" className="px-6">
            Finish Entry
          </Button>
        </div>
      </div>
    </div>
  );
}
