"use client";

import { cn } from "@memoize/ui";
import { Card } from "@memoize/ui/card";
import { ScrollArea } from "@memoize/ui/scroll-area";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import AddEntry from "~/components/entires/add-entry";
import Search from "~/components/layout/search";
import { useEntries } from "~/hooks/use-entries";
import { useEntrySync } from "~/hooks/use-entry-sync";
import FetchEntries from "./fetch-entries";
import { Drawer, DrawerContent, DrawerTrigger } from "@memoize/ui/drawer";
import { Button } from "@memoize/ui/button";
import { Menu } from "lucide-react";

export default function Layout({ children }: { children: React.ReactNode }) {
  const pathName = usePathname();
  const pathNameIsNotDashboard = pathName.includes("/entry");
  const [isMobile, setIsMobile] = useState(false);

  useEntrySync();
  useEntries();
  useEffect(() => {
    const checkIfMobile = () => setIsMobile(window.innerWidth < 768);
    checkIfMobile();
    window.addEventListener("resize", checkIfMobile);
    return () => window.removeEventListener("resize", checkIfMobile);
  }, []);
  return (
    <section className="relative flex-1 gap-0 md:flex p-5">
      {isMobile ? (
        <div className="sticky top-0 z-10 bg-background border-b p-2 flex justify-between items-center">
          <h1 className="text-lg font-semibold">Your App Name</h1>
          <Drawer>
            <DrawerTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-6 w-6" />
              </Button>
            </DrawerTrigger>
            <DrawerContent className="p-4">
              <SidebarContent />
            </DrawerContent>
          </Drawer>
        </div>
      ) : (
        <Card className={cn("w-full p-2  sm:w-96 border-r shadow-sm")}>
          <SidebarContent />
        </Card>
      )}
      <AddEntry />
      <div className="relative grid w-full items-center px-2 md:block  md:p-0 mx-2">
        <ScrollArea className="h-[calc(100vh-6rem)]">{children}</ScrollArea>
      </div>
    </section>
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
