"use client";

import { Badge } from "@memoize/ui/badge";
import { Textarea } from "@memoize/ui/textarea";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { useDebounce } from "~/hooks/debounce";
import { api } from "~/trpc/react";

type SaveStatus = "saved" | "saving" | "error";

interface EntryEditorProps {
  defaultText?: string;
  id?: string | null;
}

const EntryEditor: React.FC<EntryEditorProps> = ({
  defaultText = "",
  id = null,
}) => {
  const [text, setText] = useState(defaultText);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [entryId, setId] = useState<string | null>(id);

  const { mutateAsync: addEntry } = api.entries.addEntry.useMutation();
  const debouncedText = useDebounce(text, 1000);

  const saveEntry = useCallback(
    async (content: string) => {
      setSaveStatus("saving");

      try {
        if (entryId) {
          await addEntry({ id: entryId, content });
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
    [addEntry, entryId],
  );

  useEffect(() => {
    if (debouncedText) {
      saveEntry(debouncedText);
    }
  }, [debouncedText, saveEntry]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
  };

  return (
    <div className="p-4 relative h-full">
      <Badge
        className="absolute top-2 right-2"
        variant={saveStatus === "saved" ? "default" : "secondary"}
      >
        {saveStatus === "saved"
          ? "Saved"
          : saveStatus === "saving"
            ? "Saving..."
            : "Error"}
      </Badge>
      <Textarea
        value={text}
        onChange={handleTextChange}
        className="min-h-[300px] h-full text-lg my-4
        resize-none focus:ring-0 border-none shadow-none focus-visible:ring-0"
        placeholder="Type your new entry here..."
      />
    </div>
  );
};

export default EntryEditor;
