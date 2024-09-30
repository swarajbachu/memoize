// Filename: entries.tsx

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { produce } from "immer";
import type { entries } from "@memoize/db";

export type Entry = entries.EntryInsert & {
  id: string;
  updatedEntry?: boolean; // Indicates an entry that has been modified
  deleted?: boolean; // Indicates an entry marked for deletion
};

type State = {
  entries: Entry[];
  setEntries: (entries: Entry[]) => void;
  addEntry: (entry: Entry) => void;
  updateEntry: (entry: Entry) => void;
  removeEntry: (id: string) => void;
};

const useStore = create<State>()(
  persist(
    (set, get) => ({
      entries: [],
      setEntries: (entries: Entry[]) => set({ entries }),
      addEntry: (entry: Entry) =>
        set(
          produce((state: State) => {
            state.entries.push(entry);
          }),
        ),
      updateEntry: (entry: Entry) =>
        set(
          produce((state: State) => {
            const index = state.entries.findIndex((en) => en.id === entry.id);
            if (index !== -1) {
              state.entries[index] = { ...state.entries[index], ...entry };
            }
          }),
        ),
      removeEntry: (id: string) =>
        set(
          produce((state: State) => {
            state.entries = state.entries.filter((entry) => entry.id !== id);
          }),
        ),
    }),
    {
      name: "entries-storage",
    },
  ),
);

export default useStore;
