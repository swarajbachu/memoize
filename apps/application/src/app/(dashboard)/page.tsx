import { currentUser } from "@clerk/nextjs/server";
import { Button } from "@memoize/ui/button";
import { Calendar, Plus } from "lucide-react";
import Analytics from "~/components/home/analytics";
import Reflections from "~/components/home/reflection";
import SummaryCards from "~/components/home/summary";

export const runtime = "edge";

export default async function HomePage() {
  const user = await currentUser();
  return (
    <section className="px-6 space-y-6">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">
          {getCurrentTime()} {user?.fullName}
        </h1>
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
      <SummaryCards streak={5} words={1000} entries={10} />
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
