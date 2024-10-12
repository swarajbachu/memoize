"use client";

import { Button } from "@memoize/ui/button";
import { Calendar, Plus } from "lucide-react";
import Link from "next/link";
import Reflections from "~/components/home/reflection";
import SummaryCards from "~/components/home/summary";
import { useEntries } from "~/hooks/use-entries";

export default function HomePage() {
  const { calculateStreaks, calculateWordCounts } = useEntries();
  return (
    <section className="sm:px-6 space-y-6">
      <header className="flex justify-between sm:flex-row flex-col gap-2 sm:items-center mb-6">
        <h1 className="text-xl sm:text-3xl font-bold">{getCurrentTime()}</h1>
        <div className="flex space-x-2 w-full sm:w-fit">
          <Button variant="outline" className="w-full">
            <Calendar className="mr-2 h-4 w-4" />
            View Calendar
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
