"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { MdSpaceDashboard } from "react-icons/md";

import { signOut } from "@memoize/auth";
import { ThemeToggle } from "@memoize/ui/theme";
import { Home, LogOut } from "lucide-react";
import { IoCalendarClear, IoJournal } from "react-icons/io5";
import { toast } from "sonner";
import { Sidebar, SidebarBody, SidebarLink } from "./sidebar-ui";

const AccordanceMenuList = [
  {
    open: 1,
    text: "Journals",
    icon: <IoCalendarClear className="h-5 w-5" />,
    items: [
      {
        subText: "All Journals",
        subIcon: <IoJournal />,
        url: "/",
      },
      {
        subText: "Calendar",
        subIcon: <IoCalendarClear />,
        url: "/calendar",
      },
    ],
  },
];

// const bottomMenu = [
//   {
//     text: "Details",
//     icon: <PluraCategory />,
//     url: "/details",
//   },
//   {
//     text: "Profile",
//     icon: <Person />,
//     url: "/profile",
//   },
//   {
//     text: "Billing",
//     icon: <Payment />,
//     url: "/billing",
//   },
//   {
//     text: "Socials",
//     icon: <Network />,
//     url: "/socials",
//   },
// ];

export function SidebarComponent() {
  const [open, setOpen] = useState(false);
  const currentPath = usePathname();

  return (
    <Sidebar open={open} setOpen={setOpen}>
      <SidebarBody className="justify-between sticky top-3  gap-10 bg-card">
        <div className="flex flex-1 flex-col overflow-y-auto overflow-x-hidden">
          {open ? <Logo /> : <LogoIcon />}
          <div className="mt-8 flex flex-col gap-2">
            {AccordanceMenuList.map((link) => (
              <div key={link.text}>
                <h2 className="mb-3 flex text-xs">{open ? link.text : ""}</h2>
                <div className="flex flex-col gap-3">
                  {link.items.map((item) => (
                    <SidebarLink
                      className={`${currentPath.includes(item.url) ? "bg-secondary " : ""} group my-1 cursor-pointer`}
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
          {/* {bottomMenu.map((link) => (
            <SidebarLink
              key={link.text}
              link={{
                label: link.text,
                href: link.url,
                icon: link.icon,
              }}
            />
          ))} */}
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
        className="flex-grow whitespace-pre font-medium text-primary"
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
