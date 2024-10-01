"use client";

import { cn } from "@memoize/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";
import { useEntries } from "~/hooks/use-entries";

export default function FetchEntries() {
  const { descEntries } = useEntries();
  const pathName = usePathname();
  return (
    <>
      {descEntries?.map((entry) => (
        <Link href={`/entry/${entry.id}`} key={entry.id}>
          <div
            className={cn(
              "p-4 cursor-pointer hover:bg-accent rounded-md",
              pathName.includes(entry.id ?? "test") && "bg-secondary",
            )}
          >
            <h3 className="font-medium">
              {entry.content.split(" ").slice(0, 5).join(" ")}
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
