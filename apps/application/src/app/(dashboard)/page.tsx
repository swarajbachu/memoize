import { Button } from "@memoize/ui/button";
import { Input } from "@memoize/ui/input";
import { ScrollArea } from "@memoize/ui/scroll-area";
import { Textarea } from "@memoize/ui/textarea";
import { MenuIcon, PlusIcon } from "lucide-react";
import { Suspense, useId } from "react";
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
    <main className="flex flex-1 h-full">
      <div className="flex-1 flex flex-col lg:flex-row ">
        {/* <div className="flex-1 flex flex-col p-4">
          <Textarea
            placeholder="Start writing your journal entry here..."
            className="flex-1 resize-none focus:outline-none"
          />
        </div> */}
      </div>
    </main>
  );
}
