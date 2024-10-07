"use client";

import { cn } from "@memoize/ui";
import { Button } from "@memoize/ui/button";
import { Card } from "@memoize/ui/card";
import { Drawer, DrawerContent, DrawerTrigger } from "@memoize/ui/drawer";
import { ScrollArea } from "@memoize/ui/scroll-area";
import { ArrowLeft, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import AddEntry from "~/components/entires/add-entry";
import Search from "~/components/layout/search";
import { useEntries } from "~/hooks/use-entries";
import { useEntrySync } from "~/hooks/use-entry-sync";
import FetchEntries from "./fetch-entries";

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
    <section className="relative flex-1 gap-0 sm:flex p-5">
      {/* {isMobile ? (
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
      ) : ( */}
      <Card
        className={cn(
          "w-full p-2  sm:w-96 border-r shadow-sm sm:block bg-transparent sm:bg-card border-none  sm:border-[0.5px]",
          pathNameIsNotDashboard ? "hidden" : "block",
        )}
      >
        <SidebarContent />
      </Card>
      {/* )} */}
      <AddEntry />
      <div
        className={cn(
          "relative grid w-full  px-2  sm:p-0 mx-2",
          !pathNameIsNotDashboard && "hidden",
        )}
      >
        <ScrollArea className="h-[calc(97dvh)]">
          <Button
            className={cn("ml-2 block sm:hidden w-fit")}
            size="md"
            asChild
          >
            <Link href="/" className="flex">
              <ArrowLeft />
              <span className="ml-2">Back To Entires</span>
            </Link>
          </Button>
          {children}
        </ScrollArea>
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
