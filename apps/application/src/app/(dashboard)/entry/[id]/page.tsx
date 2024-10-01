"use client";

import EntryEditor from "~/components/entires/entry-editor";
import useStore from "~/store/entries"; // Directly use the store

export default function EntryPage({ params }: { params: { id: string } }) {
  const entry = useStore((state) =>
    state.entries.find((en) => en.id === params.id),
  );
  console.log("Entry:", entry);

  if (!entry) {
    return <div>Entry not found</div>;
  }

  return (
    <section className="h-[90vh]">
      <EntryEditor {...entry} />
    </section>
  );
}
