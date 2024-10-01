import { useEffect } from "react";
import useStore from "~/store/entries";
import { api } from "~/trpc/react";

export const useEntrySync = () => {
  const entries = useStore((state) => state.entries);
  const updateEntryInStore = useStore((state) => state.updateEntry);
  const removeEntry = useStore((state) => state.removeEntry);

  const utils = api.useUtils();
  const addEntryMutation = api.entries.addEntry.useMutation();
  const deleteEntryMutation = api.entries.deleteEntry.useMutation();

  const syncEntries = async () => {
    try {
      // Handle updated entries
      const updatedEntries = entries.filter(
        (entry) => entry.updatedEntry && !entry.deleted,
      );
      console.log("Syncing entries:", updatedEntries);
      for (const entry of updatedEntries) {
        await addEntryMutation.mutateAsync({
          id: entry.id,
          content: entry.content,
          // Include other fields
        });
        updateEntryInStore({ ...entry, updatedEntry: false });
      }

      // Handle deleted entries (if applicable)
      const deletedEntries = entries.filter((entry) => entry.deleted);
      for (const entry of deletedEntries) {
        if (!entry.id) continue;
        await deleteEntryMutation.mutateAsync(entry.id);
        removeEntry(entry.id);
      }

      // Invalidate cache
      utils.entries.findAllEntires.invalidate();
    } catch (error) {
      console.error("Error syncing entries:", error);
    }
  };

  // Sync when the user leaves the website or moves to another tab
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        syncEntries();
      }
    };

    window.addEventListener("beforeunload", syncEntries);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", syncEntries);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [entries]);

  // Sync every two minutes
  useEffect(() => {
    const intervalId = setInterval(
      () => {
        syncEntries();
      },
      2 * 60 * 1000,
    ); // 2 minutes

    return () => clearInterval(intervalId);
  }, [entries]);
};
