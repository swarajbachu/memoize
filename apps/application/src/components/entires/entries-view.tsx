"use client";

import { cn } from "@memoize/ui";
import { Badge } from "@memoize/ui/badge";
import { Button } from "@memoize/ui/button";
import { Card, CardContent, CardHeader } from "@memoize/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@memoize/ui/dialog";
import { ScrollArea } from "@memoize/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@memoize/ui/tabs";
import type { MessageType } from "@memoize/validators/entries";
import { emotions } from "@memoize/validators/journal-constants";
import { format } from "date-fns";
import { Download, Trash2 } from "lucide-react";

type JournalEntryProps = {
  messages: MessageType[];
  aiAnalysis: {
    title: string;
    summary: string;
    feeling: string[];
    topics: string[];
    people: string[];
    moodLevel: number;
  };
  timestamp: Date;
};

export default function JournalEntry({
  messages,
  aiAnalysis,
  timestamp,
}: JournalEntryProps) {
  const handleDelete = () => {};
  const onExport = () => {};

  return (
    <Card className="w-full max-w-3xl shadow-none">
      <CardHeader className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <h2 className="text-2xl font-bold tracking-tight">
              {aiAnalysis.title}
            </h2>
            <time className="text-sm text-muted-foreground">
              {format(timestamp, "EEEE, MMMM do h:mm a")}
            </time>
          </div>
          <div className="flex space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onExport}
              className="hover:bg-secondary"
            >
              <Download className="h-4 w-4" />
            </Button>
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-xl">Delete Entry</DialogTitle>
                  <DialogDescription className="text-muted-foreground">
                    This action cannot be undone. This will permanently delete
                    your journal entry.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-3 sm:gap-0">
                  <DialogClose asChild>
                    <Button variant="outline">Cancel</Button>
                  </DialogClose>
                  <Button variant="destructive" onClick={handleDelete}>
                    Delete Entry
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <Tabs defaultValue="reflection" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="journal">Journal Entry</TabsTrigger>
            <TabsTrigger value="reflection">AI Reflection</TabsTrigger>
          </TabsList>

          <div className="h-[calc(100vh-300px)] min-h-[400px] w-full">
            <TabsContent value="journal" className="h-full">
              <ScrollArea className="h-full pr-4">
                <div className="space-y-4">
                  {messages.map((message, index) => (
                    <div
                      key={message.createdAt}
                      className={cn(
                        "rounded-lg p-4",
                        message.role === "assistant"
                          ? "bg-primary/5"
                          : "bg-secondary/20",
                      )}
                    >
                      <p
                        className={cn(
                          "text-sm leading-relaxed",
                          message.role === "assistant" && "font-medium",
                        )}
                      >
                        {message.content}
                      </p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="reflection" className="h-full">
              <ScrollArea className="h-full pr-4">
                <div className="space-y-6">
                  <div className="rounded-lg bg-secondary/20 p-4">
                    <p className="text-sm leading-relaxed">
                      {aiAnalysis.summary.replace('"', "")}
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold">Topics</h3>
                      <div className="flex flex-wrap gap-2">
                        {aiAnalysis.topics.map((topic) => (
                          <Badge
                            key={topic}
                            variant="secondary"
                            className="px-3 py-1"
                          >
                            {topic}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold">Emotions</h3>
                      <div className={cn("flex flex-wrap gap-2")}>
                        {aiAnalysis.feeling.map((feeling) => (
                          <Badge
                            key={feeling}
                            variant="secondary"
                            className={cn(
                              "px-3 py-1",
                              emotions.find((e) => e.value === feeling)
                                ?.className,
                            )}
                          >
                            {emotions.find((e) => e.value === feeling)?.emoji}{" "}
                            {feeling}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {aiAnalysis.people.length > 0 && (
                      <div className="space-y-2">
                        <h3 className="text-sm font-semibold">
                          People Mentioned
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {aiAnalysis.people.map((person) => (
                            <Badge
                              key={person}
                              variant="secondary"
                              className="px-3 py-1"
                            >
                              {person}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>
          </div>
        </Tabs>
      </CardContent>
    </Card>
  );
}
