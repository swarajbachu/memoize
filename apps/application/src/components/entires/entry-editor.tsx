"use client";

import type { entries } from "@memoize/db";
import { Badge } from "@memoize/ui/badge";
import { Textarea } from "@memoize/ui/textarea";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { useDebounce } from "~/hooks/debounce";
import useStore from "~/store/entries";
import { api } from "~/trpc/react";

type EntryEditorProps = Partial<entries.EntrySelect>;
const EntryEditor: React.FC<EntryEditorProps> = ({
  content = "",
  id,
  userId,
}) => {
  const [text, setText] = useState(content);
  const debounceText = useDebounce(text, 500);
  const [entryId, setEntryId] = useState<string | undefined>(id);

  const addEntryToStore = useStore((state) => state.addEntry);
  const updateEntryInStore = useStore((state) => state.updateEntry);

  // TRPC mutations
  const utils = api.useUtils();
  const addEntryMutation = api.entries.addEntry.useMutation({
    onSuccess: (data) => {
      // Update the entry in the store with the new ID from the server
      if (data) {
        addEntryToStore({
          ...data,
          updatedEntry: false,
          deleted: false,
        });
        setEntryId(data.id);
      }
      // Invalidate queries to refresh cache
      utils.entries.findAllEntires.invalidate();
    },
  });

  // Handle text change
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
  };

  const saveEntry = useCallback(
    async (content: string) => {
      if (entryId && userId) {
        // Update existing entry in the store
        updateEntryInStore({
          id: entryId,
          content: content,
          updatedAt: new Date(),
          updatedEntry: true,
          userId,
        });
      } else {
        // Create a new entry with a temporary ID
        const newEntry = await addEntryMutation.mutateAsync({
          content: debounceText,
        });
        if (!newEntry) {
          return;
        }
        setEntryId(newEntry?.id);
      }
    },
    [entryId],
  );

  useEffect(() => {
    saveEntry(debounceText);
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
