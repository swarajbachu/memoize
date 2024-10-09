"use client";

import { cn } from "@memoize/ui";
import { ScrollArea } from "@memoize/ui/scroll-area";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import Search from "~/components/layout/search";
import FetchEntries from "../fetch-entries";

export default function EntiresLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathName = usePathname();

  return (
    <section className="flex">
      <div
        className={cn(
          "w-full px-2  sm:w-64 lg:w-96 sm:block bg-transparent border-none",
          pathName.includes("/entries/") ? "hidden" : "block",
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
