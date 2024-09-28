import { Card } from "@memoize/ui/card";
import { Textarea } from "@memoize/ui/textarea";
import EntryEditor from "~/components/entires/entry-editor";
import { api } from "~/trpc/server";

export const runtime = "edge";

export default async function EntryPage({
  params,
}: {
  params: { id: string };
}) {
  const entry = await api.entries.findEntryById(params.id);
  return (
    <section className="h-[90vh]">
      <EntryEditor id={params.id} defaultText={entry?.content} />
    </section>
  );
}
