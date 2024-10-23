import EntryCard from "~/components/entires/entry-card";
import { api } from "~/trpc/server";

export default async function FetchEntries() {
  const allEntries = await api.entries.findAllEntires();
  console.log(Object.entries(allEntries).length, "allEntries");
  return (
    <>
      {Object.entries(allEntries).map(([month, entries]) => (
        <div key={month} className="px-3">
          <h2 className="text-lg font-bold my-4 ml-1">{month}</h2>
          {entries.map((entry) => (
            <EntryCard key={entry.id} {...entry} />
          ))}
        </div>
      ))}
      {Object.entries(allEntries).length === 0 && (
        <p className="text-foreground">No entries found</p>
      )}
    </>
  );
}
