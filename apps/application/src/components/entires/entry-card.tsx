import { cn } from "@memoize/ui";
import { Separator } from "@memoize/ui/separator";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";
import type { Entry } from "~/store/entries";

export default function EntryCard({ ...props }: Entry) {
  const pathName = usePathname();

  return (
    <Link href={`/entry/${props.id}`}>
      <div
        className={cn(
          " cursor-pointer hover:bg-accent border-[0.5px] bg-card sm:bg-background rounded-md shadow-md my-3",
          pathName.includes(props.id ?? "test") && "bg-background/80",
        )}
      >
        <h3 className="text-sm p-4">
          {props.content.split(" ").slice(0, 20).join(" ")}
        </h3>
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
