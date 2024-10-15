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

import { useRouter } from "next/navigation";
import { CiSearch } from "react-icons/ci";
import useStore from "~/store/entries";

export default function Search() {
  const [open, setOpen] = React.useState(false);
  const entries = useStore((state) => state.entries);
  const [searchValue, setSearchValue] = React.useState("");
  const router = useRouter();

  const highlightText = (text: string, search: string) => {
    if (!search.trim()) return text;

    const searchWords = search
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word.toLowerCase());

    const regex = new RegExp(`(${searchWords.join("|")})`, "gi");

    return text.split(regex).map((part, index) => {
      if (searchWords.includes(part.toLowerCase())) {
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
          <span key={index} className="bg-sky-300 dark:bg-sky-800">
            {part}
          </span>
        );
      }
      return part;
    });
  };

  const filteredNotes = entries.filter((note) =>
    searchValue
      .split(/\s+/)
      .filter(Boolean)
      .every((word) => note.content.toLowerCase().includes(word.toLowerCase())),
  );

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
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="search">
            {filteredNotes.map((note) => (
              <CommandItem
                key={note.id}
                value={note.content}
                onSelect={() => {
                  runCommand(() => router.push(`/entry/${note.id}`));
                }}
              >
                <div className="w-full">
                  <p className="text-sm">
                    {highlightText(note.content, searchValue)}
                  </p>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  );
}
