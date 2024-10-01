"use client";

import type { entries } from "@memoize/db";
import { Badge } from "@memoize/ui/badge";
import { Textarea } from "@memoize/ui/textarea";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { useDebounce } from "~/hooks/debounce";
import useStore from "~/store/entries";
import { api } from "~/trpc/react";

type EntryEditorProps = Partial<entries.EntrySelect>;

const EntryEditor: React.FC<EntryEditorProps> = ({ id, content, userId }) => {
  const [text, setText] = useState(content ?? "");
  const [entryId, setEntryId] = useState<string | undefined>(id);
  const debounceText = useDebounce(text, 500);
  const isAdding = useRef(false); // Prevent multiple addEntry calls

  // Zustand store actions
  const addEntryToStore = useStore((state) => state.addEntry);
  const updateEntryInStore = useStore((state) => state.updateEntry);

  // TRPC mutations
  const utils = api.useContext();
  const addEntryMutation = api.entries.addEntry.useMutation({
    onSuccess: (data) => {
      if (data) {
        // Add the newly created entry to the store
        addEntryToStore({
          ...data,
          updatedEntry: false,
          deleted: false,
        });
        setEntryId(data.id); // Set the actual ID
      }
      // Invalidate queries to refresh cache
      utils.entries.findAllEntires.invalidate();
      isAdding.current = false; // Reset the adding flag
    },
    onError: (error) => {
      console.error("Error adding entry:", error);
      isAdding.current = false; // Reset the adding flag on error
    },
  });

  // Handle text change
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
  };

  // Effect to create entry when user starts typing
  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    if (!entryId && text.trim().length > 0 && !isAdding.current) {
      isAdding.current = true;
      addEntryMutation.mutate({
        content: text.trim(),
      });
    }
  }, [entryId, text]);

  // Effect to update entry in the store when debounced text changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    if (entryId && debounceText.trim().length > 0) {
      updateEntryInStore({
        id: entryId,
        content: debounceText.trim(),
        updatedAt: new Date(),
        updatedEntry: true, // Mark as updated for synchronization
        userId: userId ?? "test",
        // Include other necessary fields if any
      });
    }
  }, [debounceText]);

  return (
    <div className="p-4 relative h-full">
      <Badge className="absolute top-2 right-2">Editing</Badge>
      <Textarea
        value={text}
        onChange={handleTextChange}
        className="min-h-[300px] h-full text-lg my-4 resize-none focus:ring-0 border-none shadow-none focus-visible:ring-0"
        placeholder="Type your new entry here..."
      />
    </div>
  );
};

export default EntryEditor;
