import { cn } from "@memoize/ui";
import { Card } from "@memoize/ui/card";
import { ScrollArea } from "@memoize/ui/scroll-area";
import { Suspense } from "react";
import Search from "~/components/layout/search";
import FetchEntries from "../fetch-entries";

export const runtime = "edge";

export default function EntiresLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <section className="flex">
      <div
        className={cn(
          "w-full px-2  sm:w-96 sm:block bg-transparent border-none",
        )}
      >
        <SidebarContent />
      </div>
      {children}
    </section>
  );
}

function SidebarContent() {
  return (
    <>
      <Search />
      <ScrollArea className="h-[calc(100vh-6rem)]">
        <Suspense fallback={<div>Loading...</div>}>
          <FetchEntries />
        </Suspense>
      </ScrollArea>
    </>
  );
}
