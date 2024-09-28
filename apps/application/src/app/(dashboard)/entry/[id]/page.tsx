import { Card } from "@memoize/ui/card";
import { Textarea } from "@memoize/ui/textarea";
import { api } from "~/trpc/server";

export const runtime = "edge";

export default async function EntryPage({
  params,
}: {
  params: { id: string };
}) {
  const entry = await api.entries.findEntryById(params.id);
  return (
    <Textarea
      className="h-full border-none  ring-transparent shadow-none resize-none focus-visible:ring-none"
      defaultValue={entry?.content}
    />
  );
}
