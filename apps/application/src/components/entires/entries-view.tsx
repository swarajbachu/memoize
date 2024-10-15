import { cn } from "@memoize/ui";
import { Avatar, AvatarFallback } from "@memoize/ui/avatar";
import { Badge } from "@memoize/ui/badge";
import { Button } from "@memoize/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@memoize/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@memoize/ui/dialog";
import { Separator } from "@memoize/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@memoize/ui/tabs";
import type { MessageType } from "@memoize/validators/entries";
import { format } from "date-fns";
import { Download, Trash2 } from "lucide-react";
import { useState } from "react";

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
  const [activeTab, setActiveTab] = useState("journal");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const handleDelete = () => {
    onDelete();
    setIsDeleteDialogOpen(false);
  };

  return (
    <Card className="w-full max-w-3xl mx-auto my-8 shadow-lg">
      <CardHeader className="flex flex-col space-y-4 pb-2">
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">
            {format(timestamp, "EEEE, MMMM do '@' h:mm a")}
          </span>
          <div className="flex space-x-2">
            <Button variant="ghost" size="sm" onClick={onExport}>
              <Download className="w-4 h-4" />
            </Button>
            <Dialog
              open={isDeleteDialogOpen}
              onOpenChange={setIsDeleteDialogOpen}
            >
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
                  <Button
                    variant="outline"
                    onClick={() => setIsDeleteDialogOpen(false)}
                  >
                    Cancel
                  </Button>
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
      <CardContent className="pt-0">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="journal">Journal</TabsTrigger>
            <TabsTrigger value="analysis">Analysis</TabsTrigger>
          </TabsList>
          <TabsContent value="journal" className="mt-4 space-y-4">
            {messages.map((message, index) => (
              <div key={message.content} className="space-y-1">
                <p
                  className={cn(
                    "text-sm whitespace-pre-wrap",
                    message.role === "assistant" && "text-primary",
                  )}
                >
                  {message.content}
                </p>
                {index < messages.length - 1 && <Separator className="my-2" />}
              </div>
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
      <CardFooter className="flex justify-between items-center bg-muted/50 mt-4">
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
      </CardFooter>
    </Card>
  );
}
