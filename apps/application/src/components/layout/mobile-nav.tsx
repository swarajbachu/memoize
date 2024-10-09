import { cn } from "@memoize/ui";
import { Button } from "@memoize/ui/button";
import { BarChart, Calendar, Clock, Home, Plus } from "lucide-react";
import Link from "next/link";

export default function MobileNav() {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-border sm:hidden">
      <nav className="flex items-center justify-around h-16 px-4 max-w-md mx-auto relative">
        <TabButton icon={<Home className="w-6 h-6" />} label="Home" href="/" />
        <TabButton
          icon={<Clock className="w-6 h-6" />}
          label="Entry"
          href="/entries"
        />
        <AddButton />
        <TabButton
          icon={<Calendar className="w-6 h-6" />}
          label="Calendar"
          href="/calendar"
        />
        <TabButton
          icon={<BarChart className="w-6 h-6" />}
          label="Analytics"
          href="/analytics"
        />
      </nav>
    </div>
  );
}

function TabButton({
  icon,
  label,
  isActive = false,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  isActive?: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex flex-col items-center justify-center w-16 h-16 text-muted-foreground",
        isActive && "text-primary",
      )}
    >
      {icon}
      <span className="text-xs mt-1">{label}</span>
    </Link>
  );
}

function AddButton() {
  return (
    <Button className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 bg-primary text-primary-foreground rounded-full w-14 h-14 flex items-center justify-center shadow-lg hover:bg-primary/90 transition-colors">
      <Plus className="w-6 h-6" />
    </Button>
  );
}
