import JournalingUI from "~/components/journal";

export default function JournalEntry({ params }: { params: { id: string } }) {
  return <JournalingUI journalId={params.id} />;
}
