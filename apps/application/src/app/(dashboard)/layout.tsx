import { Input } from "@memoize/ui/input";
import { ScrollArea } from "@memoize/ui/scroll-area";
import { Suspense } from "react";
import { SidebarComponent } from "~/components/layout/sidebar-comp";
import FetchEntries from "./fetch-entries";
import { Card, CardHeader } from "@memoize/ui/card";
import Search from "~/components/layout/search";
import AddEntry from "~/components/entires/add-entry";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <section className="relative flex-1 gap-0 md:flex p-5">
      {/* <SidebarComponent /> */}
      <Card className="w-full p-2 lg:w-64 border-r shadow-sm">
        <Search />
        <ScrollArea className="h-[calc(100vh-6rem)]">
          <Suspense fallback={<div>Loading...</div>}>
            <FetchEntries />
          </Suspense>
        </ScrollArea>
      </Card>
      <AddEntry />
      <div className="relative grid w-full items-center px-2 md:block  md:p-0">
        {children}
      </div>
    </section>
  );
}
