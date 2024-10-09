"use client";
import { SidebarComponent } from "~/components/layout/sidebar-comp";
import { useEntries } from "~/hooks/use-entries";
import { useEntrySync } from "~/hooks/use-entry-sync";

export default function Layout({ children }: { children: React.ReactNode }) {
  useEntrySync();
  useEntries();

  return (
    <section className="relative h-screen flex-1 gap-0 flex p-5">
      <SidebarComponent />
      <main className="flex-1 px-3 ">{children}</main>
    </section>
  );
}
