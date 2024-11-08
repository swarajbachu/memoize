"use client";

import { cn } from "@memoize/ui";
import { Separator } from "@memoize/ui/separator";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Entry } from "~/store/entries";

export default function EntryCard({ ...props }: Entry) {
  const pathName = usePathname();

  return (
    <Link href={`/entries/${props.id}`}>
      <div
        className={cn(
          "cursor-pointer hover:bg-accent border-[0.5px] bg-card  rounded-md shadow-md my-3",
          pathName.includes(props.id ?? "test") && "bg-background",
        )}
      >
        <h3 className="text-base  p-4 ">{props.title}</h3>
        <Separator className="" />
        <p className="text-sm text-muted-foreground px-4 py-2">
          {props.createdAt
            ? new Date(props.createdAt).toDateString()
            : new Date().toDateString()}
        </p>
      </div>
    </Link>
  );
}
