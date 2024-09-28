"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@memoize/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@memoize/ui/drawer";
import { Textarea } from "@memoize/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@memoize/ui/tooltip";
import { PlusIcon } from "lucide-react";
import { Badge } from "@memoize/ui/badge";
import { api } from "~/trpc/react";
import { useDebounce } from "~/hooks/debounce";

type SaveStatus = "saved" | "saving" | "error";

export default function Component() {
  const [isOpen, setIsOpen] = useState(false);
  const [text, setText] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [id, setId] = useState<string | null>(null);

  const { mutateAsync: addEntry } = api.entries.addEntry.useMutation();

  const debouncedText = useDebounce(text, 2000);

  const saveEntry = useCallback(
    async (content: string) => {
      setSaveStatus("saving");
      try {
        if (id) {
          await addEntry({ id, content });
        } else {
          const newEntry = await addEntry({ content });
          if (!newEntry) {
            throw new Error("Failed to save entry");
          }
          setId(newEntry.id);
        }
        setSaveStatus("saved");
      } catch (error) {
        console.error("Error saving entry:", error);
        setSaveStatus("error");
      }
    },
    [id, addEntry],
  );

  useEffect(() => {
    if (debouncedText) {
      saveEntry(debouncedText);
    }
  }, [debouncedText, saveEntry]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
  };

  const handleNewEntry = () => {
    setId(null);
    setText("");
    setSaveStatus("saved");
    setIsOpen(true);
  };

  return (
    <Drawer open={isOpen} onOpenChange={setIsOpen}>
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DrawerTrigger asChild>
              <Button
                className="fixed bottom-4 right-4 rounded-full w-12 h-12 z-50"
                size="icon"
                onClick={handleNewEntry}
              >
                <PlusIcon className="h-6 w-6" />
                <span className="sr-only">New Entry</span>
              </Button>
            </DrawerTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>New Entry</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DrawerContent className="z-50 h-[90vh]">
        <div className="mx-auto w-full ">
          <DrawerHeader className="flex justify-between items-center">
            <DrawerTitle>Add New</DrawerTitle>
            <Badge variant={saveStatus === "saved" ? "default" : "secondary"}>
              {saveStatus === "saved"
                ? "Saved"
                : saveStatus === "saving"
                  ? "Saving..."
                  : "Error"}
            </Badge>
          </DrawerHeader>
          <div className="p-4">
            <Textarea
              value={text}
              onChange={handleTextChange}
              className="min-h-[300px] resize-none focus:ring-0 focus:border-primary"
              placeholder="Type your new entry here..."
            />
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
