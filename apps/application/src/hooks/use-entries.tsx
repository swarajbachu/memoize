// Filename: useEntries.ts

import { useEffect } from "react";
import useStore, { type Entry } from "~/store/entries";
import { api } from "~/trpc/react";

export function useEntries() {
  const entries = useStore((state) => state.entries);
  const setEntries = useStore((state) => state.setEntries);

  const { data, isLoading, error, refetch } =
    api.entries.findAllEntires.useQuery(undefined, {
      refetchOnWindowFocus: false,
      enabled: entries.length === 0, // Only fetch if entries are empty
    });

  useEffect(() => {
    if (data) {
      const processedEntries = data.map((entry: Entry) => ({
        ...entry,
        updatedAt: entry.updatedAt ? new Date(entry.updatedAt) : new Date(),
        newEntry: false,
        updatedEntry: false,
        deleted: false,
      }));
      setEntries(processedEntries);
      console.log("Entries set to store:", processedEntries);
    }
  }, [data, setEntries]);

  // Periodic sync every 5 minutes
  useEffect(() => {
    const intervalId = setInterval(
      () => {
        refetch();
      },
      5 * 60 * 1000,
    ); // 5 minutes

    return () => clearInterval(intervalId);
  }, [refetch]);

  const getEntryById = (id: string) => entries.find((entry) => entry.id === id);

  const descEntries = [...entries].sort((a, b) => {
    if (b.updatedAt && a.updatedAt) {
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    }
    if (b.updatedAt) return 1;
    if (a.updatedAt) return -1;
    return 0;
  });

  return { descEntries, entries, isLoading, error, getEntryById };
}
