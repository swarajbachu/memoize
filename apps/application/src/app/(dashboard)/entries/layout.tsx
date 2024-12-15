import { ScrollArea } from "@memoize/ui/scroll-area";
import { Suspense } from "react";
import EntriesSideBarWrapper from "~/components/layout/entries-sidebar-wrapper";
import Search from "~/components/layout/search";
import FetchEntries from "../fetch-entries";

export default function EntiresLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <section className="flex h-full w-full">
      <EntriesSideBarWrapper>
        <SidebarContent />
      </EntriesSideBarWrapper>
      {children}
    </section>
  );
}

function SidebarContent() {
  return (
    <>
      <Search />
      <ScrollArea className="h-[calc(100vh-3rem)]">
        <Suspense fallback={<div>Loading...</div>}>
          <FetchEntries />
        </Suspense>
      </ScrollArea>
    </>
  );
}
