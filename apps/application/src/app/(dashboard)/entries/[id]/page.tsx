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
    title: "A Day of High Productivity and Team Collaboration",
    summary:
      "Today was marked by significant achievements in both individual and team contexts, showcasing strong project management skills and effective leadership. The journal entry reflects a high level of job satisfaction and self-efficacy, particularly in relation to productivity.",
    feeling: "Accomplished",
    topics: [
      "Productivity",
      "Leadership",
      "Team Collaboration",
      "Project Management",
    ],
    people: ["Team", "Stakeholders"],
    moodLevel: 90,
  };

  return (
    <section className="h-[calc(100vh-3rem)]">
      <JournalEntry
        messages={entry.content}
        aiAnalysis={demoAiAnalysis}
        timestamp={entry.createdAt ?? new Date()}
        onDelete={() => {}}
        onExport={() => {}}
      />
    </section>
  );
}
