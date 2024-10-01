"use client";

import EntryEditor from "~/components/entires/entry-editor";
import { useEntries } from "~/hooks/use-entries";

export default function EntryPage({ params }: { params: { id: string } }) {
  const { getEntryById } = useEntries();
  const entry = getEntryById(params.id);
  if (!entry) {
    return <div>Entry not found</div>;
  }
  return (
    <section className="h-[90vh]">
      <EntryEditor {...entry} />
    </section>
  );
}
