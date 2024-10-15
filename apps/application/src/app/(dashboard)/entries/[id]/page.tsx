"use client";

import JournalEntry from "~/components/entires/entries-view";
import useStore from "~/store/entries"; // Directly use the store

export default function EntryPage({ params }: { params: { id: string } }) {
  const entry = useStore((state) =>
    state.entries.find((en) => en.id === params.id),
  );
  console.log("Entry:", entry);

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
    <section className="h-[90vh]">
      {/* <EntryEditor {...entry} /> */}
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
