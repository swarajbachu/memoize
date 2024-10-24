"use client";

import { cn } from "@memoize/ui";
import { Button } from "@memoize/ui/button";
import { Skeleton } from "@memoize/ui/skeleton";
import { ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { api } from "~/trpc/react";

// Define the MessageSchema as per backend requirements
export const MessageSchema = z.object({
  content: z.string(),
  createdAt: z.string(),
  role: z.enum(["assistant", "user"]),
  type: z.string(),
});

// Type for a single message
type Message = z.infer<typeof MessageSchema>;

// Props for the JournalingUI component
interface JournalingUIProps {
  journalId?: string;
}

export default function JournalingUI({ journalId }: JournalingUIProps) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [entries, setEntries] = useState<Message[]>([]);
  const [currentAnswer, setCurrentAnswer] = useState<string>("");
  const [currentQuestion, setCurrentQuestion] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [entryId, setEntryId] = useState<string | undefined>(undefined);

  const containerRef = useRef<HTMLDivElement>(null);
  const currentQuestionRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isInitialSave = useRef(true);
  const router = useRouter();

  const { mutateAsync: finishEntryAnalysis, isPending: finishingEntry } =
    api.entries.finishEntryAnalysis.useMutation();

  // Mutation to fetch the next question
  const { mutate: getNextQuestion, isPending: generatingNextQuestion } =
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

  // Mutation to add/update journal entry
  const { mutate: addEntry, isPending: addingEntry } =
    api.entries.addEntry.useMutation({
      onSuccess: (data) => {
        if (data && isInitialSave.current) {
          setEntryId(data.id);
          isInitialSave.current = false;
        }
      },
      onError: (error) => {
        console.error("Error saving entry:", error);
      },
    });

  // Fetch the initial question when the component mounts
  useEffect(() => {
    if (currentQuestion === null && !isLoading) {
      setIsLoading(true);
      const questionParams = {
        ...(journalId && { journalId }),
        currentConversation: entries.map((entry) => entry.content),
      };
      getNextQuestion({
        ...questionParams,
      });
    }
  }, [currentQuestion, entries, getNextQuestion, journalId]);

  // Focus and adjust textarea height when the current question or loading state changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
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
  }, [currentQuestionIndex, isLoading]);

  // Function to adjust the textarea height
  const adjustTextareaHeight = (element: HTMLTextAreaElement) => {
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  };

  // Handle input change in the textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCurrentAnswer(e.target.value);
    adjustTextareaHeight(e.target);
  };

  // Handle moving to the next question
  const handleNextQuestion = () => {
    if (currentAnswer.trim() !== "" && currentQuestion) {
      const now = new Date().toISOString();

      const questionMessage: Message = {
        content: currentQuestion,
        createdAt: now,
        role: "assistant",
        type: "text",
      };

      const answerMessage: Message = {
        content: currentAnswer,
        createdAt: now,
        role: "user",
        type: "text",
      };

      const updatedEntries = [...entries, questionMessage, answerMessage];
      setEntries(updatedEntries);

      setCurrentAnswer("");
      setCurrentQuestionIndex((prev) => prev + 1);
      setCurrentQuestion("");
      setIsLoading(true);

      // Fetch the next question without waiting for it to update the UI
      const questionParams = {
        ...(journalId && { journalId }),
        currentConversation: updatedEntries.map((entry) => entry.content),
      };
      const questions = getNextQuestion({
        ...questionParams,
      });

      console.log(questions, "quest");

      // Save the entry
      const entryData = {
        messages: updatedEntries,
        ...(entryId && { id: entryId }),
        ...(journalId && { journalId }),
      };

      addEntry(entryData);
    }
  };

  // Handle finishing the journaling session
  const handleFinish = async () => {
    if (currentAnswer.trim() !== "" && currentQuestion && entries.length > 0) {
      const now = new Date().toISOString();

      const questionMessage: Message = {
        content: currentQuestion,
        createdAt: now,
        role: "assistant",
        type: "text",
      };

      const answerMessage: Message = {
        content: currentAnswer,
        createdAt: now,
        role: "user",
        type: "text",
      };

      const updatedEntries = [...entries, questionMessage, answerMessage];
      setEntries(updatedEntries);
      const entryData = {
        messages: updatedEntries,
        ...(entryId && { id: entryId }),
        ...(journalId && { journalId }),
      };
      addEntry(entryData);
    }
    if (!entryId) {
      return;
    }

    await finishEntryAnalysis({
      entryId: entryId,
      journalEntires: entries,
    }).then(() => {
      router.push(`/entries/${entryId}`);
    });
    // Perform any final actions, such as navigation or showing a summary
    console.log("Journaling session finished", entries);
    // You might want to redirect the user or show a confirmation message here
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault();
      handleNextQuestion();
    }
  };

  return (
    <div className="h-[98vh] flex flex-col bg-background text-foreground">
      <div className="flex-grow overflow-auto" ref={containerRef}>
        <div className="max-w-2xl mx-auto p-6 flex flex-col">
          {/* Previous Entries */}
          {entries.slice(0, -2).map((entry, index) => (
            <div
              key={`${entry.role}-${index}-${entry.createdAt}`}
              className={cn(
                "mb-4 transition-opacity duration-500",
                "opacity-50",
              )}
            >
              {entry.role === "assistant" && (
                <p className="font-semibold text-lg mb-1 whitespace-pre-wrap">
                  {entry.content}
                </p>
              )}
              {entry.role === "user" && (
                <p className="whitespace-pre-wrap text-muted-foreground">
                  {entry.content}
                </p>
              )}
            </div>
          ))}

          {/* Current Question and Answer */}
          {entries.slice(-2).map((entry, index) => (
            <div
              key={`${entry.role}-current-${index}-${entry.createdAt}`}
              className="mb-8"
            >
              {entry.role === "assistant" && (
                <p className="font-semibold text-lg mb-4 whitespace-pre-wrap">
                  {entry.content}
                </p>
              )}
              {entry.role === "user" && (
                <p className="whitespace-pre-wrap text-muted-foreground">
                  {entry.content}
                </p>
              )}
            </div>
          ))}

          {/* Skeleton Loader or New Question */}
          <div
            ref={currentQuestionRef}
            className="min-h-[calc(100vh-8rem)] flex flex-col justify-start"
          >
            {isLoading ? (
              <Skeleton className="h-8 w-1/2 mb-4" />
            ) : currentQuestion ? (
              <p className="text-lg font-semibold mb-4 whitespace-pre-wrap">
                {currentQuestion}
              </p>
            ) : null}

            {!isLoading && (
              <textarea
                ref={inputRef}
                value={currentAnswer}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                className="w-full bg-transparent resize-none outline-none overflow-hidden text-lg"
                rows={1}
                placeholder="Start typing your answer here..."
                disabled={isLoading}
              />
            )}
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
              currentAnswer.trim() === "" ||
              isLoading ||
              finishingEntry ||
              generatingNextQuestion
            }
            loading={generatingNextQuestion}
            className="px-6"
          >
            Next <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
          <Button
            onClick={handleFinish}
            loading={finishingEntry}
            disabled={
              currentAnswer.trim() === "" ||
              isLoading ||
              finishingEntry ||
              generatingNextQuestion
            }
            variant="outline"
            className="px-6"
          >
            Finish Entry
          </Button>
        </div>
      </div>
    </div>
  );
}
