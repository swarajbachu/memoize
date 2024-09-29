import { Input } from "@memoize/ui/input";
import { ScrollArea } from "@memoize/ui/scroll-area";
import { Suspense } from "react";
import { SidebarComponent } from "~/components/layout/sidebar-comp";
import FetchEntries from "./fetch-entries";
import { Card, CardHeader } from "@memoize/ui/card";
import Search from "~/components/layout/search";
import AddEntry from "~/components/entires/add-entry";
import { headers } from "next/headers";
import { cn } from "@memoize/ui";

export default function Layout({ children }: { children: React.ReactNode }) {
  const head = headers();
  const domain = head.get("host") || "";
  const fullUrl = head.get("referer") || "";

  const pathName = fullUrl.replace(`https://${domain}`, "");
  const pathNameIsDashboard =
    pathName === "/dashboard" || pathName === "/dashboard/";

  return (
    <section className="relative flex-1 gap-0 md:flex p-5">
      {/* <SidebarComponent /> */}
      <Card
        className={cn(
          "w-full p-2  sm:w-96 border-r shadow-sm",
          pathNameIsDashboard ? "block" : "md:block hidden",
        )}
      >
        <Search />
        <ScrollArea className="h-[calc(100vh-9rem)]">
          <Suspense fallback={<div>Loading...</div>}>
            <FetchEntries />
          </Suspense>
        </ScrollArea>
      </Card>
      <AddEntry />
      <div className="relative grid w-full items-center px-2 md:block  md:p-0 mx-2">
        <ScrollArea className="h-[calc(100vh-6rem)]">{children}</ScrollArea>
      </div>
    </section>
  );
}
