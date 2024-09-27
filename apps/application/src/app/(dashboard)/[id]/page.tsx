import { Card } from "@memoize/ui/card";
import { api } from "~/trpc/server";

export const runtime = "edge";

export default async function EntryPage({
  params,
}: {
  params: { id: string };
}) {
  const entry = await api.entries.findEntryById(params.id);
  return (
    <main className="flex flex-1">
      <Card className="flex-1 p-4">{entry?.content}</Card>
    </main>
  );
}
