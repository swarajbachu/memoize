import { useEffect } from "react";
import useStore, { type Entry } from "~/store/entries";
import { api } from "~/trpc/react";

export function useEntries() {
  const entries = useStore((state) => state.entries);
  const addEntries = useStore((state) => state.addEntries);

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
      console.log("Entries fetched:", processedEntries);
      addEntries(processedEntries); // This will update existing entries
    }
  }, [data, addEntries]);

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
    if (b.createdAt && a.createdAt) {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    if (b.createdAt) return 1;
    if (a.createdAt) return -1;
    return 0;
  });

  const groupedEntriesByMonth = descEntries.reduce(
    (acc: Record<string, Entry[]>, entry) => {
      const date = entry.createdAt ? new Date(entry.createdAt) : new Date();
      const monthKey = date.toLocaleString("default", {
        month: "long",
        year: "numeric",
      });
      if (!acc[monthKey]) {
        acc[monthKey] = [];
      }
      acc[monthKey].push(entry);
      return acc;
    },
    {},
  );

  interface Streak {
    count: number;
    start: Date | null;
    end: Date | null;
  }

  function calculateStreaks(): {
    currentStreak: Streak;
    longestStreak: Streak;
  } {
    const descEntries = [...entries].sort((a, b) => {
      if (b.createdAt && a.createdAt) {
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      }
      if (b.createdAt) return 1;
      if (a.createdAt) return -1;
      return 0;
    });

    let currentStreak: Streak = { count: 0, start: null, end: null };
    let longestStreak: Streak = { count: 0, start: null, end: null };
    let streakStart: Date | null = null;

    for (let i = 0; i < descEntries.length; i++) {
      const entryDate = new Date(descEntries[i]?.createdAt || new Date());
      const nextEntryDate =
        i > 0 ? new Date(descEntries[i - 1]?.createdAt ?? new Date()) : null;

      if (
        i === 0 ||
        (nextEntryDate && isConsecutiveDay(entryDate, nextEntryDate))
      ) {
        if (!streakStart) streakStart = entryDate;
        currentStreak.count++;
      } else {
        if (currentStreak.count > longestStreak.count) {
          longestStreak = {
            ...currentStreak,
            // biome-ignore lint/style/noNonNullAssertion: <explanation>
            start: streakStart!,
            end: entryDate,
          };
        }
        currentStreak = { count: 1, start: entryDate, end: null };
        streakStart = entryDate;
      }
    }

    // Check if the current streak is the longest
    if (currentStreak.count > longestStreak.count) {
      longestStreak = {
        ...currentStreak,
        // biome-ignore lint/style/noNonNullAssertion: <explanation>
        start: streakStart!,
        end: new Date(
          descEntries[descEntries.length - 1]?.createdAt ?? new Date(),
        ),
      };
    }

    // Update current streak start date
    currentStreak.start = streakStart;

    // Update current streak end date
    currentStreak.end = new Date(descEntries[0]?.createdAt || new Date());

    // Reset current streak if the last entry is not from today or yesterday
    const lastEntryDate = new Date(descEntries[0]?.createdAt || new Date());
    const today = new Date();
    if (
      !isConsecutiveDay(lastEntryDate, today) &&
      !isSameDay(lastEntryDate, today)
    ) {
      currentStreak = { count: 0, start: null, end: null };
    }

    return { currentStreak, longestStreak };
  }

  // Function to calculate word counts
  function calculateWordCounts(): number {
    return entries.reduce((total, entry) => {
      return (
        total +
        entry.content.split(/\s+/).filter((word) => word.length > 0).length
      );
    }, 0);
  }

  // Helper function to check if two dates are consecutive days
  function isConsecutiveDay(date1: Date, date2: Date): boolean {
    const oneDayInMs = 24 * 60 * 60 * 1000;
    const diffInDays = Math.round(
      (date2.getTime() - date1.getTime()) / oneDayInMs,
    );
    return diffInDays === 1;
  }

  // Helper function to check if two dates are the same day
  function isSameDay(date1: Date, date2: Date): boolean {
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  }

  return {
    descEntries,
    entries,
    isLoading,
    error,
    getEntryById,
    groupedEntriesByMonth,
    calculateStreaks,
    calculateWordCounts,
  };
}
