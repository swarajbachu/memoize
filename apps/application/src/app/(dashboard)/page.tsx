"use client";

import Reflections from "~/components/home/reflection";
import SummaryCards from "~/components/home/summary";
import { useEntries } from "~/hooks/use-entries";

export default function HomePage() {
  const { calculateStreaks, calculateWordCounts } = useEntries();
  return (
    <section className="px-6 space-y-6">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">{getCurrentTime()}</h1>
        {/* <div className="flex space-x-2">
          <Button variant="outline">
            <Calendar className="mr-2 h-4 w-4" />
            View Calendar
          </Button>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Entry
          </Button>
        </div> */}
      </header>
      <SummaryCards
        streak={calculateStreaks().currentStreak.count}
        words={calculateWordCounts()}
        entries={10}
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
