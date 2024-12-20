import JournalEntry from "~/components/entires/entries-view";
import { api } from "~/trpc/server";

export default async function EntryPage({
  params,
}: {
  params: { id: string };
}) {
  const entry = await api.entries.findEntryById(params.id);

  if (!entry) {
    return <div>Entry not found</div>;
  }

  const demoAiAnalysis = {
    title: entry.title ?? "",
    summary: (entry.entryAnalysis?.analysis as string) ?? "",
    feeling: entry.entryAnalysis?.feelings ?? [],
    topics: entry.entryToTopics.map(
      (et) => `${et.topic.emoji} ${et.topic.topic}`,
    ),
    people: entry.entryToPeople?.map((etp) => etp.person.personName) ?? [],
    moodLevel: 90,
  };

  return (
    <section className="h-[calc(100vh-3rem)] w-full flex justify-start">
      <JournalEntry
        messages={entry.content}
        aiAnalysis={demoAiAnalysis}
        timestamp={entry.createdAt ?? new Date()}
      />
    </section>
  );
}
