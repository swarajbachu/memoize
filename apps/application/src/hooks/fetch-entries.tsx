import { useEffect } from "react";
import { api } from "~/trpc/react";
import useStore from "~/store/entries";

export function useEntries() {
  const entries = useStore((state) => state.entries);
  // Initial fetch on component mount

  const getEntryById = (id: string) => entries.find((entry) => entry.id === id);

  return { entries, getEntryById };
}
