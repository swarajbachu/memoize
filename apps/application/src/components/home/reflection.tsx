"use client";

import { Button } from "@memoize/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
  CardFooter,
} from "@memoize/ui/card";
import { Checkbox } from "@memoize/ui/checkbox";
import { CheckCircle2, Circle } from "lucide-react";
import React, { useEffect, useState } from "react";
import { Badge } from "@memoize/ui/badge";
import Image from "next/image";
import { cn } from "@memoize/ui";

// Mock data for todos
const initialTodos = [
  { id: 1, text: "Write about yesterday's events", completed: false },
  { id: 2, text: "Reflect on personal growth", completed: false },
  { id: 3, text: "Set goals for today", completed: true },
];

export default function Reflections() {
  const [isMorning, setIsMorning] = useState(true);
  const [morningReflectionDone, setMorningReflectionDone] = useState(true);
  const [eveningReflectionDone, setEveningReflectionDone] = useState(false);
  const [todos, setTodos] = useState(initialTodos);

  useEffect(() => {
    const now = new Date();
    const hours = now.getHours();
    setIsMorning(hours < 12);
  }, []);

  const toggleTodo = (id: number) => {
    setTodos(
      todos.map((todo) =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo,
      ),
    );
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <Card className="flex flex-col justify-between relative">
        <CardContent className="flex pt-6 items-start justify-between">
          <div>
            <Badge variant="secondary" className="w-fit h-fit mb-6 rounded-sm">
              Daily Check in
            </Badge>
            <h4 className="flex items-center text-2xl font-semibold">
              Morning Reflection
            </h4>
            <p className="text-muted-foreground">
              Reflect on yesterday's events, set goals for today, and more.
            </p>
          </div>
          <Image
            src="journals/morning-reflection.svg"
            alt="Morning Reflection"
            width={200}
            height={200}
            className="-mt-6"
          />
        </CardContent>
        <CardFooter>
          <Button
            className={cn("w-full")}
            variant={morningReflectionDone ? "outline" : "primary"}
          >
            {morningReflectionDone ? "Read Your Entry" : "Start Reflection"}
            {morningReflectionDone ? (
              <CheckCircle2 className="ml-2 h-4 w-4 text-green-500" />
            ) : (
              <Circle className="ml-2 h-4 w-4 text-gray-300" />
            )}
          </Button>
        </CardFooter>
      </Card>

      {!isMorning && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <span className="mr-2">🌙</span> Evening Reflection
              {eveningReflectionDone ? (
                <CheckCircle2 className="ml-2 h-4 w-4 text-green-500" />
              ) : (
                <Circle className="ml-2 h-4 w-4 text-gray-300" />
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full"
              variant={eveningReflectionDone ? "outline" : "primary"}
              onClick={() => setEveningReflectionDone(!eveningReflectionDone)}
            >
              {eveningReflectionDone ? "Edit Reflection" : "Start Reflection"}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Today's Todos</CardTitle>
          <CardDescription>Your tasks for the day</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {todos.map((todo) => (
              <li key={todo.id} className="flex items-center space-x-2">
                <Checkbox
                  id={`todo-${todo.id}`}
                  checked={todo.completed}
                  onCheckedChange={() => toggleTodo(todo.id)}
                />
                <label
                  htmlFor={`todo-${todo.id}`}
                  className={`text-sm ${
                    todo.completed ? "line-through text-gray-500" : ""
                  }`}
                >
                  {todo.text}
                </label>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
