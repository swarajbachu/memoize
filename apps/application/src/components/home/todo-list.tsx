"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@memoize/ui/card";
import { Checkbox } from "@memoize/ui/checkbox";
import type React from "react";
import { useState } from "react";

interface Todo {
  id: string;
  text: string;
  completed: boolean;
}

interface TodoListProps {
  initialTodos: Todo[];
}

const TodoList: React.FC<TodoListProps> = ({ initialTodos }) => {
  const [todos, setTodos] = useState(initialTodos);

  const toggleTodo = async (id: string) => {
    const updatedTodos = todos.map((todo) =>
      todo.id === id ? { ...todo, completed: !todo.completed } : todo,
    );
    setTodos(updatedTodos);
    // await updateTodo(id, !todos.find(todo => todo.id === id)?.completed);
  };

  return (
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
  );
};

export default TodoList;
