"use client";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@memoize/ui/select";
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

// Demo data for journal entries
const journalEntries = [
  { id: 1, date: new Date(2023, 9, 5), title: "Productive Day", mood: "Happy" },
  {
    id: 2,
    date: new Date(2023, 9, 10),
    title: "Challenging Meeting",
    mood: "Stressed",
  },
  {
    id: 3,
    date: new Date(2023, 9, 15),
    title: "Family Gathering",
    mood: "Joyful",
  },
  {
    id: 4,
    date: new Date(2023, 9, 20),
    title: "Personal Achievement",
    mood: "Proud",
  },
  {
    id: 5,
    date: new Date(2023, 9, 25),
    title: "Relaxing Weekend",
    mood: "Calm",
  },
  {
    id: 6,
    date: new Date(2023, 10, 2),
    title: "New Month Goals",
    mood: "Motivated",
  },
  {
    id: 7,
    date: new Date(2023, 10, 7),
    title: "Project Deadline",
    mood: "Focused",
  },
];

export default function ImprovedJournalCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedEntry, setSelectedEntry] = useState<
    (typeof journalEntries)[0] | null
  >(null);
  const [isOpen, setIsOpen] = useState(false);
  const isMobile = useDeviceType() === "mobile";

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const handlePrevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const handleNextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const handlePrevYear = () => setCurrentDate(subYears(currentDate, 1));
  const handleNextYear = () => setCurrentDate(addYears(currentDate, 1));

  const handleYearChange = (year: string) => {
    const newDate = new Date(currentDate);
    newDate.setFullYear(Number.parseInt(year));
    setCurrentDate(newDate);
  };

  const handleDateClick = (date: Date) => {
    const entry = journalEntries.find((entry) => isSameDay(entry.date, date));
    if (entry) {
      setSelectedEntry(entry);
      setIsOpen(true);
    }
  };

  const years = Array.from(
    { length: 10 },
    (_, i) => currentDate.getFullYear() - 5 + i,
  );

  const EntryDetails = () => (
    <>
      <DialogHeader>
        <DialogTitle>
          {selectedEntry && format(selectedEntry.date, "MMMM d, yyyy")}
        </DialogTitle>
      </DialogHeader>
      {selectedEntry && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">{selectedEntry.title}</h3>
          <p className="text-sm text-muted-foreground">
            Mood: {selectedEntry.mood}
          </p>
        </div>
      )}
    </>
  );

  return (
    <div className="w-full max-w-4xl mx-auto p-4">
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
          <Select
            onValueChange={handleYearChange}
            value={currentDate.getFullYear().toString()}
          >
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((year) => (
                <SelectItem key={year} value={year.toString()}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
      <div className="grid grid-cols-7 gap-1 bg-gray-200">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <div key={day} className="text-center font-semibold p-2 bg-white">
            {day}
          </div>
        ))}
        {monthDays.map((day, dayIdx) => {
          const dayEntries = journalEntries.filter((entry) =>
            isSameDay(entry.date, day),
          );
          return (
            // biome-ignore lint/a11y/useKeyWithClickEvents: <explanation>
            <div
              key={day.toString()}
              className={`
                min-h-[100px] p-2 bg-card rounded-md 
                ${!isSameMonth(day, currentDate) && "opacity-50"}
                ${isToday(day) && "ring-2 ring-blue-500 "}
              `}
              onClick={() => handleDateClick(day)}
            >
              <div
                className={`text-right ${
                  isToday(day) ? "font-bold text-blue-500" : ""
                }`}
              >
                {format(day, "d")}
              </div>
              <div className="mt-1 space-y-1">
                {dayEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="text-xs p-1 bg-card text-primary rounded truncate"
                    title={entry.title}
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
              <EntryDetails />
            </div>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <EntryDetails />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
