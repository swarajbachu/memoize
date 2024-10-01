"use client";

import Link from "next/link";
import React from "react";
import { useEntries } from "~/hooks/use-entries";

export default function FetchEntries() {
  const { descEntries } = useEntries();

  return (
    <>
      {descEntries?.map((entry) => (
        <Link href={`/entry/${entry.id}`} key={entry.id}>
          <div className="p-4 cursor-pointer hover:bg-accent rounded-md">
            <h3 className="font-medium">
              {entry.content.split(" ").slice(0, 10).join(" ")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {entry.updatedAt
                ? entry.updatedAt.toLocaleString()
                : new Date().toLocaleString()}
            </p>
          </div>
        </Link>
      ))}
    </>
  );
}
