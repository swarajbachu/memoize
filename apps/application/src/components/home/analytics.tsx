"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@memoize/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@memoize/ui/chart";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

const analyticsData = [
  { day: "Mon", wordCount: 520, mood: 65 },
  { day: "Tue", wordCount: 650, mood: 72 },
  { day: "Wed", wordCount: 800, mood: 85 },
  { day: "Thu", wordCount: 720, mood: 78 },
  { day: "Fri", wordCount: 600, mood: 70 },
  { day: "Sat", wordCount: 450, mood: 62 },
  { day: "Sun", wordCount: 700, mood: 80 },
];

export default function Analytics() {
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Journal Analytics</CardTitle>
        <CardDescription>
          Your writing and mood trends over the past week
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col md:flex-row w-full">
          <div className="flex-1 p-2">
            <h3 className="text-center mb-4">Word Count</h3>
            <ChartContainer
              config={{
                wordCount: {
                  label: "Word Count",
                  color: "hsl(var(--chart-1))",
                },
              }}
              className="h-[300px]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analyticsData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line
                    type="monotone"
                    dataKey="wordCount"
                    stroke="var(--color-wordCount)"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>
          <div className="flex-1 p-2">
            <h3 className="text-center mb-4">Mood</h3>
            <ChartContainer
              config={{
                mood: {
                  label: "Mood",
                  color: "hsl(var(--chart-2))",
                },
              }}
              className="h-[300px]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analyticsData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" />
                  <YAxis domain={[0, 100]} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line
                    type="monotone"
                    dataKey="mood"
                    stroke="var(--color-mood)"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
