import { ScrollArea } from "@memoize/ui/scroll-area";
import React, { Suspense } from "react";
import FetchEntries from "../fetch-entries";
import Search from "~/components/layout/search";
import { Card } from "@memoize/ui/card";
import { cn } from "@memoize/ui";

export default function EntriesPage() {
  return (
    <div>
      <Card
        className={cn(
          "w-full p-2  sm:w-96 border-r shadow-sm sm:block bg-transparent sm:bg-card border-none  sm:border-[0.5px]",
        )}
      >
        <SidebarContent />
      </Card>
    </div>
  );
}

function SidebarContent() {
  return (
    <>
      <Search />
      <ScrollArea className="h-[calc(100vh-9rem)]">
        <Suspense fallback={<div>Loading...</div>}>
          <FetchEntries />
        </Suspense>
      </ScrollArea>
    </>
  );
}
