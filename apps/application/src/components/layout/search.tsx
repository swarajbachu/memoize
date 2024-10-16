"use client";

import React from "react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@memoize/ui/command";

import { DialogTitle } from "@memoize/ui/dialog";

import type { MessageType } from "@memoize/validators/entries";
import { useRouter } from "next/navigation";
import { CiSearch } from "react-icons/ci";
import { api } from "~/trpc/react";

export default function Search() {
  const [open, setOpen] = React.useState(false);
  const { data } = api.entries.allEntries.useQuery();
  const [searchValue, setSearchValue] = React.useState("");
  const router = useRouter();

  // Filter notes based on search input
  const filteredNotes = React.useMemo(() => {
    if (!data || !searchValue.trim()) return [];

    const searchWords = searchValue.toLowerCase().split(/\s+/).filter(Boolean);

    return data
      .map((note) => {
        const combinedContent = note.content
          .map((message: MessageType) => message.content)
          .join(" ");

        const lowerCombinedContent = combinedContent.toLowerCase();

        // Check if all search words are present in the combined content (partial matches)
        const matchesAllSearchWords = searchWords.every((word) =>
          lowerCombinedContent.includes(word),
        );

        if (matchesAllSearchWords) {
          return { note, combinedContent };
        }
        return null;
      })
      .filter(Boolean) as Array<{
      note: (typeof data)[0];
      combinedContent: string;
    }>;
  }, [data, searchValue]);

  // Function to generate a snippet around the first occurrence of any search term
  const generateSnippet = (
    text: string,
    searchWords: string[],
    snippetLength = 20,
  ) => {
    const textWords = text.split(/\s+/);
    const lowerTextWords = textWords.map((word) => word.toLowerCase());

    // Find the index of the first occurrence of any search word
    const firstMatchIndex = lowerTextWords.findIndex((word) =>
      searchWords.some((sw) => word.includes(sw)),
    );

    let start = 0;
    if (firstMatchIndex !== -1) {
      start = Math.max(0, firstMatchIndex - Math.floor(snippetLength / 2));
    }

    const snippetWords = textWords.slice(start, start + snippetLength);
    return snippetWords.join(" ");
  };

  // Function to highlight search terms in the text
  const highlightText = (text: string, searchWords: string[]) => {
    return text
      .split(new RegExp(`(${searchWords.join("|")})`, "gi"))
      .map((part, index) =>
        searchWords.some((word) => part.toLowerCase().includes(word)) ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
          <span key={index} className="bg-sky-300 dark:bg-sky-800">
            {part}
          </span>
        ) : (
          part
        ),
      );
  };

  // Keyboard shortcut to open the search dialog
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const runCommand = React.useCallback((command: () => unknown) => {
    setOpen(false);
    command();
  }, []);

  return (
    <div className="px-3">
      <button
        onClick={() => setOpen(true)}
        type="button"
        className="inline-flex mb-2 mt-1 w-full items-center whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input hover:bg-accent hover:text-accent-foreground px-4 py-2 relative h-8 justify-start rounded-[0.5rem] bg-muted/50 text-sm font-normal text-muted-foreground shadow-none sm:pr-12 flex-1"
      >
        <CiSearch className="mr-3 stroke-[1.5px]" />
        <span className="hidden lg:inline-flex">Search journal...</span>
        <span className="inline-flex lg:hidden">Search...</span>
        <kbd className="pointer-events-none absolute right-[0.3rem] top-[0.3rem] hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <DialogTitle> </DialogTitle>
        <CommandInput
          placeholder="Type a command or search..."
          value={searchValue}
          onValueChange={setSearchValue}
        />
        <CommandList>
          <CommandGroup heading="search">
            <CommandEmpty>No results found.</CommandEmpty>
            {filteredNotes.map(({ note, combinedContent }) => {
              const searchWords = searchValue
                .toLowerCase()
                .split(/\s+/)
                .filter(Boolean);

              const snippet = generateSnippet(combinedContent, searchWords, 20);

              return (
                <CommandItem
                  key={note.id}
                  value={combinedContent}
                  onSelect={() => {
                    runCommand(() => router.push(`/entry/${note.id}`));
                  }}
                >
                  <div className="w-full">
                    <p className="text-sm">
                      {highlightText(snippet, searchWords)}
                    </p>
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  );
}
