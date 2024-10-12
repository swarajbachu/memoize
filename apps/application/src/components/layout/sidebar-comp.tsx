"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { useClerk } from "@clerk/nextjs";
import { cn } from "@memoize/ui";
import { Button } from "@memoize/ui/button";
import { ThemeToggle } from "@memoize/ui/theme";
import { BarChart, Calendar, Clock, Home, LogOut, Plus } from "lucide-react";
import { GoHomeFill } from "react-icons/go";
import { IoCalendarClear, IoJournal } from "react-icons/io5";
import { toast } from "sonner";
import useDeviceType from "~/hooks/use-device-type";
import { Sidebar, SidebarBody, SidebarLink } from "./sidebar-ui";

const AccordanceMenuList = [
  {
    open: 1,
    text: "Journals",
    icon: <IoCalendarClear className="h-5 w-5" />,
    items: [
      {
        subText: "Home",
        subIcon: <GoHomeFill />,
        url: "/",
      },
      {
        subText: "All Journals",
        subIcon: <IoJournal />,
        url: "/entries",
      },
      {
        subText: "Calendar",
        subIcon: <IoCalendarClear />,
        url: "/calendar",
      },
    ],
  },
];

export function SidebarComponent() {
  const device = useDeviceType();
  const [open, setOpen] = useState(device === "desktop");
  const currentPath = usePathname();
  const { signOut } = useClerk();

  return (
    <Sidebar open={open} setOpen={setOpen}>
      <SidebarBody className="justify-between sticky top-3  gap-10 bg-card z-50">
        <div className=" flex-1 flex-col overflow-y-auto overflow-x-hidden hidden md:flex">
          {open ? <Logo /> : <LogoIcon />}
          <div className="mt-8 flex flex-col gap-2">
            {AccordanceMenuList.map((link) => (
              <div key={link.text}>
                <h2 className="mb-3 flex text-xs">{open ? link.text : ""}</h2>
                <div className="flex flex-col gap-3">
                  {link.items.map((item) => (
                    <SidebarLink
                      className={`${
                        currentPath === item.url ||
                        (item.url !== "/" && currentPath.startsWith(item.url))
                          ? "bg-secondary "
                          : ""
                      } group my-1 cursor-pointer`}
                      key={item.url}
                      link={{
                        label: item.subText,
                        href: item.url,
                        icon: item.subIcon,
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <hr className="dark:border-neutral my-8 border-neutral-300" />
          <SidebarLink
            link={{
              label: "Logout",
              href: "#",
              icon: <LogOut />,
              onClick: () => {
                toast.promise(signOut(), {
                  loading: "Logging out",
                  success: "Logged out",
                  error: "Error logging out",
                });
              },
            }}
          />
        </div>
        <nav className="flex md:hidden items-center justify-around h-16 px-4 max-w-md mx-auto relative">
          <TabButton
            icon={<Home className="w-6 h-6" />}
            label="Home"
            href="/"
          />
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
      </SidebarBody>
    </Sidebar>
  );
}
export const Logo = () => {
  return (
    <Link
      href="#"
      className="relative z-20 hidden items-center space-x-2 py-1 text-sm font-normal md:flex"
    >
      <LogoIcon />
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex-grow whitespace-pre font-medium"
      >
        Memoize
      </motion.span>
      <ThemeToggle />
      <span className="w-6" />
    </Link>
  );
};
export const LogoIcon = () => {
  return (
    <Link
      href="#"
      className="relative z-20 hidden items-center space-x-2 py-1 text-sm font-normal text-black md:flex"
    >
      <Image
        src="/favicon.svg"
        alt="brand"
        className="h-8 w-8 invert dark:invert-0"
        width={8}
        height={8}
      />
    </Link>
  );
};

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
    <Button
      asChild
      className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 bg-primary text-primary-foreground rounded-full w-14 h-14 flex items-center justify-center shadow-lg hover:bg-primary/90 transition-colors"
    >
      <Link href="/entry">
        <Plus className="w-6 h-6" />
      </Link>
    </Button>
  );
}
