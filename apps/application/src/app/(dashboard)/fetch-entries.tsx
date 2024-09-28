import Link from "next/link";
import React from "react";
import { api } from "~/trpc/server";

export default async function FetchEntries() {
  const entries = await api.entries.findAllEntires();

  return (
    <>
      {entries.map((entry) => (
        <Link href={`/entry/${entry.id}`} key={entry.id}>
          <div className="p-4 cursor-pointer hover:bg-accent rounded-md">
            <h3 className="font-medium">
              {entry.content.split(" ").slice(0, 10).join(" ")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {entry.createdAt.toDateString()}
            </p>
          </div>
        </Link>
      ))}
    </>
  );
}
