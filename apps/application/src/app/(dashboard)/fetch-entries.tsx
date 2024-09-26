import React from "react";
import { api } from "~/trpc/server";

export default async function FetchEntries() {
  const entries = await api.auth.findAllEntires();

  return (
    <>
      {entries.map((entry) => (
        <div
          key={entry.id}
          className="p-4 border-b cursor-pointer hover:bg-accent"
        >
          <h3 className="font-medium">
            {entry.content.split(" ").slice(0, 10).join(" ")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {entry.createdAt.toDateString()}
          </p>
        </div>
      ))}
    </>
  );
}
