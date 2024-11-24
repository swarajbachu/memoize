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
import React from "react";

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
    <Card className="w-full max-w-3xl h-full  flex-1">
      <CardHeader className="flex flex-col space-y-4 pb-2">
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">
            {format(timestamp, "EEEE, MMMM do h:mm a")}
          </span>
          <div className="flex space-x-2">
            <Button variant="ghost" size="sm" onClick={onExport}>
              <Download className="w-4 h-4" />
            </Button>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    Are you sure you want to delete this entry?
                  </DialogTitle>
                  <DialogDescription>
                    This action cannot be undone. This will permanently delete
                    your journal entry.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">Cancel</Button>
                  </DialogClose>
                  <Button variant="destructive" onClick={handleDelete}>
                    Delete
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        <h2 className="text-2xl font-semibold">{aiAnalysis.title}</h2>
      </CardHeader>
      <CardContent className="pt-0 w-full">
        <Tabs className="w-full" defaultValue="reflection">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="journal">Journal</TabsTrigger>
            <TabsTrigger value="reflection">Reflect</TabsTrigger>
          </TabsList>
          <div className="mt-4 h-[calc(100vh-300px)] min-h-[400px] w-full">
            <TabsContent value="journal" className="h-full w-full">
              <ScrollArea className="h-full pr-4">
                {messages.map((message, index) => (
                  <React.Fragment key={message.content}>
                    <p
                      className={cn(
                        "text-sm my-0 mb-1",
                        message.role === "assistant" &&
                          "text-primary whitespace-pre-line font-semibold",
                      )}
                    >
                      {message.content}
                    </p>
                    {index < messages.length - 1 && message.role === "user" && (
                      <hr className="my-4" />
                    )}
                  </React.Fragment>
                ))}
              </ScrollArea>
            </TabsContent>
            <TabsContent value="reflection" className="h-full w-full">
              <ScrollArea className="h-full pr-4">
                <p className="text-sm mb-4 whitespace-pre-wrap">
                  {aiAnalysis.summary.replace('"', "")}
                </p>
                <div className="flex flex-wrap gap-2 mb-4">
                  <span className="text-sm font-medium">Topics:</span>
                  {aiAnalysis.topics.map((topic) => (
                    <Badge key={topic} variant="secondary">
                      {topic}
                    </Badge>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2 mb-4">
                  <span className="text-sm font-medium">Feeling:</span>
                  {aiAnalysis.feeling.map((feeling) => (
                    <Badge key={feeling} variant="secondary">
                      {emotions.find((e) => e.value === feeling)?.emoji}{" "}
                      {feeling}
                    </Badge>
                  ))}
                </div>
                {aiAnalysis.people.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    <span className="text-sm font-medium">People:</span>
                    {aiAnalysis.people.map((person) => (
                      <Badge key={person} variant="secondary">
                        {person}
                      </Badge>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </div>
        </Tabs>
      </CardContent>
    </Card>
  );
}
