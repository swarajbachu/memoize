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
import { SidebarComponent } from "~/components/layout/sidebar-comp";

export default function Layout({ children }: { children: React.ReactNode }) {
  const pathName = usePathname();

  useEntrySync();
  useEntries();

  return (
    <section className="relative flex-1 gap-0 flex p-5">
      <SidebarComponent />
      <main className="flex-1 p-2 sm:p-5">{children}</main>
    </section>
  );
}
