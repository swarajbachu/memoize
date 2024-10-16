import { cn } from "@memoize/ui";
import { Avatar, AvatarFallback } from "@memoize/ui/avatar";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@memoize/ui/tabs";
import type { MessageType } from "@memoize/validators/entries";
import { format } from "date-fns";
import { Download, Trash2 } from "lucide-react";
import React from "react";

type JournalEntryProps = {
  messages: MessageType[];
  aiAnalysis: {
    title: string;
    summary: string;
    feeling: string;
    topics: string[];
    people: string[];
    moodLevel: number;
  };
  timestamp: Date;
  onExport: () => void;
  onDelete: () => void;
};

export default function JournalEntry({
  messages,
  aiAnalysis,
  timestamp,
  onExport,
  onDelete,
}: JournalEntryProps) {
  const handleDelete = () => {
    onDelete();
  };

  return (
    <Card className="w-full max-w-3xl h-full mx-auto">
      <CardHeader className="flex flex-col space-y-4 pb-2">
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">
            {format(timestamp, "EEEE, MMMM do h:mm a")}
          </span>
          <div className="flex space-x-2">
            <Button variant="ghost" size="sm">
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
                  <Button variant="destructive">Delete</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        <h2 className="text-2xl font-semibold">{aiAnalysis.title}</h2>
      </CardHeader>
      <CardContent className="pt-0">
        <Tabs className="w-full" defaultValue="analysis">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="journal">Journal</TabsTrigger>
            <TabsTrigger value="analysis">Analysis</TabsTrigger>
          </TabsList>
          <TabsContent value="journal" className="mt-4 ">
            {messages.map((message, index) => (
              <React.Fragment key={message.content}>
                <p
                  className={cn(
                    "text-sm  my-0 mb-1",
                    message.role === "assistant" &&
                      "text-primary whitespace-pre-line font-semibold ",
                  )}
                >
                  {message.content}
                </p>
                {index < messages.length - 1}
                {message.role === "user" && <hr className="my-4" />}
              </React.Fragment>
            ))}
          </TabsContent>
          <TabsContent value="analysis" className="mt-4">
            <p className="text-sm mb-4">{aiAnalysis.summary}</p>
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="text-sm font-medium">Topics:</span>
              {aiAnalysis.topics.map((topic, index) => (
                <Badge key={aiAnalysis.title} variant="secondary">
                  {topic}
                </Badge>
              ))}
            </div>
            <div className="flex items-center space-x-2 mb-4">
              <span className="text-sm font-medium">People:</span>
              {aiAnalysis.people.map((person, index) => (
                <Avatar key={aiAnalysis.moodLevel} className="w-6 h-6">
                  <AvatarFallback>{person[0]}</AvatarFallback>
                </Avatar>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
      {/* <CardFooter className="flex justify-between items-center bg-muted/50 mt-4">
        <div className="flex items-center space-x-2">
          <span className="text-sm font-medium">Feeling:</span>
          <Badge variant="outline">{aiAnalysis.feeling}</Badge>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-sm font-medium">Mood:</span>
          <div className="w-24 bg-secondary rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full"
              style={{ width: `${aiAnalysis.moodLevel}%` }}
            />
          </div>
          <span className="text-sm">{aiAnalysis.moodLevel}%</span>
        </div>
      </CardFooter> */}
    </Card>
  );
}
