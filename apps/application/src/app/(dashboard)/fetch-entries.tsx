"use client";

import { cn } from "@memoize/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";
import EntryCard from "~/components/entires/entry-card";
import { useEntries } from "~/hooks/use-entries";

export default function FetchEntries() {
  const { groupedEntriesByMonth } = useEntries();

  return (
    <>
      {Object.entries(groupedEntriesByMonth).map(([month, entries]) => (
        <div key={month} className="px-3">
          <h2 className="text-lg font-bold my-4 ml-1">{month}</h2>
          {entries.map((entry) => (
            <EntryCard key={entry.id} {...entry} />
          ))}
        </div>
      ))}
    </>
  );
}
