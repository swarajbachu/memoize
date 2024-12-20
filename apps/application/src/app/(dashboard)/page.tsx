import { Button } from "@memoize/ui/button";
import { Calendar, Plus } from "lucide-react";
import Link from "next/link";
import Reflections from "~/components/home/reflection";
import SummaryCards from "~/components/home/summary";
import { api } from "~/trpc/server";

export default async function HomePage() {
  // const { calculateStreaks, calculateWordCounts } = useEntries();
  const streaks = await api.entries.getStreak();
  const count = await api.entries.getEntriesCount();
  return (
    <section className="sm:px-6 space-y-6">
      <header className="flex justify-between sm:flex-row flex-col gap-2 sm:items-center mb-6">
        <h1 className="text-xl sm:text-3xl font-bold">{getCurrentTime()}</h1>
        <div className="flex space-x-2 w-full sm:w-fit">
          <Button variant="outline" className="w-full" asChild>
            <Link href="/calendar">
              <Calendar className="mr-2 h-4 w-4" />
              View Calendar
            </Link>
          </Button>
          <Button className="w-full" asChild>
            <Link href="/entry">
              <Plus className="mr-2 h-4 w-4" />
              New Entry
            </Link>
          </Button>
        </div>
      </header>
      <SummaryCards
        streak={streaks?.currentStreak.count ?? 0}
        words={Number.parseInt(count?.words ?? "0")}
        entries={count?.count ?? 0}
      />
      <Reflections />
      {/* <Analytics /> */}
    </section>
  );
}

const getCurrentTime = () => {
  const currentHour = new Date().getHours();
  if (currentHour < 12) return "Good morning!";
  if (currentHour < 18) return "Good afternoon!";
  return "Good evening!";
};
