"use client";

import { cn } from "@memoize/ui";
import { Button } from "@memoize/ui/button";
import { Skeleton } from "@memoize/ui/skeleton";
import { ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "~/trpc/react";

interface Entry {
  question: string;
  answer: string;
}

export default function JournalingUI() {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [currentAnswer, setCurrentAnswer] = useState<string>("");
  const [currentQuestion, setCurrentQuestion] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentQuestionRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { mutate: getNextQuestion, isPending: isLoadingQuestion } =
    api.entries.getNextQuestion.useMutation({
      onSuccess: (data) => {
        setCurrentQuestion(data);
        setIsLoading(false);
      },
      onError: (error) => {
        console.error("Failed to fetch question:", error);
        setIsLoading(false);
      },
    });

  useEffect(() => {
    if (currentQuestion === null && !isLoading) {
      setIsLoading(true);
      getNextQuestion({
        currentConversation: entries.flatMap((entry) => [
          entry.question,
          entry.answer,
        ]),
      });
    }
  }, [currentQuestion, entries, getNextQuestion]);

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
    if (currentAnswer.trim() !== "" && currentQuestion) {
      setEntries([
        {
          question: currentQuestion,
          answer: currentAnswer,
        },
        ...entries,
      ]);
      setCurrentAnswer("");
      setCurrentQuestionIndex((prev) => prev + 1);
      setCurrentQuestion(null);
      setIsLoading(true);
      getNextQuestion({
        currentConversation: [
          ...entries,
          { question: currentQuestion, answer: currentAnswer },
        ].flatMap((e) => [e.question, e.answer]),
      });
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
    <div className="h-screen flex flex-col bg-background text-foreground">
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
              <p className="font-semibold text-lg mb-2 whitespace-pre-line">
                {entry.question}
              </p>
              <p className="whitespace-pre-wrap text-muted-foreground">
                {entry.answer}
              </p>
            </div>
          ))}
          {/* Current Question and Text Editor */}
          <div
            ref={currentQuestionRef}
            className="min-h-[calc(100vh-8rem)] flex flex-col justify-start whitespace-pre-line"
          >
            {isLoading || isLoadingQuestion ? (
              <Skeleton className="h-8 w-1/2 mb-4" />
            ) : (
              <p className="text-lg font-semibold  mb-4">{currentQuestion}</p>
            )}
            <textarea
              ref={inputRef}
              value={currentAnswer}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              className="w-full bg-transparent resize-none outline-none overflow-hidden text-lg"
              rows={1}
              placeholder="Start typing your answer here..."
              disabled={isLoading || isLoadingQuestion}
            />
          </div>
        </div>
      </div>
      <div className="p-6 flex justify-between items-center border-t sm:mb-0 mb-[100px]">
        <p className="text-sm text-muted-foreground hidden sm:block">
          Press Ctrl + Enter for next question
        </p>
        <div className="space-x-4">
          <Button
            onClick={handleNextQuestion}
            disabled={
              currentAnswer.trim() === "" || isLoading || isLoadingQuestion
            }
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
