import { Button } from "@memoize/ui/button";
import { Input } from "@memoize/ui/input";
import { ScrollArea } from "@memoize/ui/scroll-area";
import { Textarea } from "@memoize/ui/textarea";
import { MenuIcon, PlusIcon } from "lucide-react";
import { Suspense } from "react";
import FetchEntries from "./fetch-entries";

export const runtime = "edge";

console.log("dashboard");

const entries = [
  { id: 1, title: "My first journal entry", date: "2023-05-01" },
  { id: 2, title: "Reflections on spring", date: "2023-05-05" },
  { id: 3, title: "Goals for the month", date: "2023-05-10" },
];

export default async function HomePage() {
  return (
    <main className="flex h-screen">
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <div className="w-full lg:w-64 border-r">
          <div className="p-4 border-b">
            <Input placeholder="Search entries..." />
          </div>
          <ScrollArea className="h-[calc(100vh-9rem)]">
            <Suspense fallback={<div>Loading...</div>}>
              <FetchEntries />
            </Suspense>
          </ScrollArea>
        </div>

        <div className="flex-1 flex flex-col p-4">
          <div className="mb-4 flex justify-between items-center">
            <Input
              placeholder="Entry title"
              className="text-2xl font-bold bg-transparent border-none"
            />
            <Button>
              <PlusIcon className="mr-2 h-4 w-4" />
              New Entry
            </Button>
          </div>
          <Textarea
            placeholder="Start writing your journal entry here..."
            className="flex-1 resize-none"
          />
        </div>
      </div>
    </main>
  );
}
