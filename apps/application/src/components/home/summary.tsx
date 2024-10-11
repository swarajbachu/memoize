import { Card, CardContent, CardHeader, CardTitle } from "@memoize/ui/card";
import { Flame, BookOpen, PenTool } from "lucide-react";

export default function SummaryCards({
  streak,
  words,
  entries,
}: {
  streak: number;
  words: number;
  entries: number;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <Card className="bg-gradient-to-br from-orange-400 to-red-500 text-white">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Streak</CardTitle>
          <Flame className="h-4 w-4 text-white" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{streak} day</div>
          {streak > 5 ? (
            <p className="text-xs text-orange-100">Keep it up!</p>
          ) : (
            <p className="text-xs text-orange-100">Current streak</p>
          )}
        </CardContent>
      </Card>
      <Card className="bg-gradient-to-br from-blue-400 to-indigo-500 text-white">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Entries</CardTitle>
          <BookOpen className="h-4 w-4 text-white" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{entries.toLocaleString()}</div>
          <p className="text-xs text-blue-100">Total journal entries</p>
        </CardContent>
      </Card>
      <Card className="bg-gradient-to-br from-green-400 to-emerald-500 text-white">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Words</CardTitle>
          <PenTool className="h-4 w-4 text-white" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{words.toLocaleString()}</div>
          <p className="text-xs text-green-100">Total words written</p>
        </CardContent>
      </Card>
    </div>
  );
}
