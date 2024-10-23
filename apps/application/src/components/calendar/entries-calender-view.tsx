"use client";

import type { entries } from "@memoize/db";
import { cn } from "@memoize/ui";
import { Button } from "@memoize/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@memoize/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@memoize/ui/drawer";
import { ScrollArea } from "@memoize/ui/scroll-area";
import {
  addMonths,
  addYears,
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  subMonths,
  subYears,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import useDeviceType from "~/hooks/use-device-type";
import { api } from "~/trpc/react";

// Demo data for journal entries

export default function ImprovedJournalCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedEntry, setSelectedEntry] =
    useState<entries.EntrySelect | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const isMobile = useDeviceType() === "mobile";
  const { data: journalEntries } = api.entries.allEntries.useQuery();

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const handlePrevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const handleNextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const handlePrevYear = () => setCurrentDate(subYears(currentDate, 1));
  const handleNextYear = () => setCurrentDate(addYears(currentDate, 1));

  const handleDateClick = (date: Date) => {
    const entry = journalEntries?.find((entry) =>
      isSameDay(entry.createdAt, date),
    );
    if (entry) {
      setSelectedEntry(entry);
      setIsOpen(true);
    }
  };

  return (
    <div className="w-full max-w-4xl sm:p-4 mx-auto">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center space-x-2">
          <Button onClick={handlePrevYear} size="icon" variant="outline">
            <ChevronLeft className="h-4 w-4" />
            <ChevronLeft className="h-4 w-4 -ml-2" />
          </Button>
          <Button onClick={handlePrevMonth} size="icon" variant="outline">
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center space-x-2">
          <h2 className="text-xl font-semibold">
            {format(currentDate, "MMMM yyyy")}
          </h2>
        </div>
        <div className="flex items-center space-x-2">
          <Button onClick={handleNextMonth} size="icon" variant="outline">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button onClick={handleNextYear} size="icon" variant="outline">
            <ChevronRight className="h-4 w-4" />
            <ChevronRight className="h-4 w-4 -ml-2" />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <div
            key={day}
            className="text-center font-semibold p-2 bg-card rounded-md"
          >
            {day}
          </div>
        ))}
        {monthDays.map((day, dayIdx) => {
          const dayEntries = journalEntries?.filter((entry) =>
            isSameDay(entry.createdAt, day),
          );
          return (
            // biome-ignore lint/a11y/useKeyWithClickEvents: <explanation>
            <div
              key={day.toString()}
              className={`
                min-h-[100px] p-2 bg-card rounded-md  
                ${!isSameMonth(day, currentDate) && "opacity-50"}
                ${isToday(day) && "ring-2 ring-primary "}
              `}
              onClick={() => handleDateClick(day)}
            >
              <div
                className={`text-right ${
                  isToday(day) ? "font-bold text-primary" : ""
                }`}
              >
                {format(day, "d")}
              </div>
              <div className="mt-1 space-y-1">
                {dayEntries?.map((entry) => (
                  <div
                    key={entry.id}
                    className="text-xs p-1 bg-muted-foreground text-background rounded truncate"
                  >
                    {entry.title}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {isMobile ? (
        <Drawer open={isOpen} onOpenChange={setIsOpen}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Journal Entry</DrawerTitle>
            </DrawerHeader>
            <div className="p-4">
              <EntryDetails selectedEntry={selectedEntry} />
            </div>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <EntryDetails selectedEntry={selectedEntry} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

const EntryDetails = ({
  selectedEntry,
}: {
  selectedEntry: entries.EntrySelect | null;
}) => (
  <>
    <DialogHeader>
      <DialogTitle>
        {selectedEntry && format(selectedEntry.createdAt, "MMMM d, yyyy")}
      </DialogTitle>
    </DialogHeader>
    {selectedEntry && (
      <ScrollArea className="space-y-4 h-[80vh] sm:h-[50vh]">
        <h3 className="text-lg font-semibold">{selectedEntry.title}</h3>
        <p className="text-sm text-muted-foreground">
          {selectedEntry.content.map((entryMessage) => (
            <p
              key={entryMessage.createdAt}
              className={cn(
                "text-sm text-muted-foreground whitespace-pre-wrap",
                entryMessage.role === "assistant" ? "text-primary" : "my-2",
              )}
            >
              {entryMessage.content}
            </p>
          ))}
        </p>
      </ScrollArea>
    )}
  </>
);
