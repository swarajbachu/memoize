"use client";

import { cn } from "@memoize/ui";
import { usePathname } from "next/navigation";

export default function EntriesSideBarWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathName = usePathname();

  return (
    <div
      className={cn(
        "w-full px-2  sm:w-64 lg:w-96 sm:block bg-transparent border-none",
        pathName.includes("/entries/") ? "hidden" : "block",
      )}
    >
      {children}
    </div>
  );
}
