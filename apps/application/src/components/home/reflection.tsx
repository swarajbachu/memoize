import { cn } from "@memoize/ui";
import { Badge } from "@memoize/ui/badge";
import { Button } from "@memoize/ui/button";
import { Card, CardContent, CardFooter } from "@memoize/ui/card";
import { CheckCircle2, Circle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { api } from "~/trpc/server";

const initialTodos = [
  {
    id: "1",
    text: "Complete the morning reflection",
    completed: false,
  },
  {
    id: "2",
    text: "Complete the evening reflection",
    completed: false,
  },
  {
    id: "3",
    text: "Complete the daily todo list",
    completed: false,
  },
];

export default async function Reflections() {
  const reflections = await api.entries.getTodayReflectionStatus();
  const morningReflection = reflections.morningReflection.status;
  const eveningReflection = reflections.eveningReflection.status;
  const morningReflectionUrl = morningReflection
    ? `/entries/${reflections.morningReflection.entry?.id}`
    : "/entry/morning_intention";
  const eveningReflectionUrl = eveningReflection
    ? `/entries/${reflections.eveningReflection.entry?.id}`
    : "/entry/evening_reflection";
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <ReflectionCard
        title="Morning Reflection"
        description="Reflect on yesterday's events, set goals for today, and more."
        imageSrc="/journals/morning-reflection.svg"
        isDone={morningReflection}
        url={morningReflectionUrl}
      />

      {new Date().getHours() >= 12 && (
        <ReflectionCard
          title="Evening Reflection"
          description="Reflect on today's events and plan for tomorrow."
          imageSrc="/journals/evening-reflection.svg"
          isDone={eveningReflection}
          url={eveningReflectionUrl}
        />
      )}

      {/* <TodoList initialTodos={initialTodos} /> */}
    </div>
  );
}

interface ReflectionCardProps {
  title: string;
  description: string;
  imageSrc: string;
  isDone: boolean;
  url: string;
}

const ReflectionCard: React.FC<ReflectionCardProps> = ({
  title,
  description,
  imageSrc,
  isDone,
  url,
}) => {
  return (
    <Card className="flex flex-col justify-between relative">
      <CardContent className="flex pt-6 items-start justify-between">
        <div>
          <Badge variant="secondary" className="w-fit h-fit mb-6 rounded-sm">
            Daily Check in
          </Badge>
          <h4 className="flex items-center text-2xl font-semibold">{title}</h4>
          <p className="text-muted-foreground">{description}</p>
        </div>
        <Image
          src={imageSrc}
          alt={title}
          width={200}
          height={200}
          className="-mt-6"
        />
      </CardContent>
      <CardFooter>
        <Button
          className={cn("w-full")}
          variant={isDone ? "outline" : "primary"}
          asChild
        >
          <Link href={url}>
            {isDone ? "Read Your Entry" : "Start Reflection"}
            {isDone ? (
              <CheckCircle2 className="ml-2 h-4 w-4 text-green-500" />
            ) : (
              <Circle className="ml-2 h-4 w-4 text-gray-300" />
            )}
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
};
