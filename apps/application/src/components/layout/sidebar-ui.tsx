"use client";

import { motion } from "framer-motion";
import { Menu } from "lucide-react";
import Image from "next/image";
import type { LinkProps } from "next/link";
import Link from "next/link";
import type React from "react";
import { createContext, useContext, useState } from "react";

import { cn } from "@memoize/ui";
import { Button } from "@memoize/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@memoize/ui/sheet";
import ToolTipSimple from "@memoize/ui/tooltip-simple";
import { FaArrowRightLong } from "react-icons/fa6";

interface Links {
  label: string;
  href: string;
  icon: React.JSX.Element | React.ReactNode;
  onClick?: () => void;
}

interface SidebarContextProps {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  animate: boolean;
}

const SidebarContext = createContext<SidebarContextProps | undefined>(
  undefined,
);

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
};

export const SidebarProvider = ({
  children,
  open: openProp,
  setOpen: setOpenProp,
  animate = true,
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
}) => {
  const [openState, setOpenState] = useState(false);

  const open = openProp ?? openState;
  const setOpen = setOpenProp ?? setOpenState;

  return (
    <SidebarContext.Provider value={{ open, setOpen, animate: animate }}>
      {children}
    </SidebarContext.Provider>
  );
};

export const Sidebar = ({
  children,
  open,
  setOpen,
  animate,
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
}) => {
  return (
    <SidebarProvider open={open} setOpen={setOpen} animate={animate}>
      {children}
    </SidebarProvider>
  );
};

export const SidebarBody = (props: React.ComponentProps<typeof motion.div>) => {
  return (
    <>
      <DesktopSidebar {...props} />
      <MobileSidebar {...(props as React.ComponentProps<"div">)} />
    </>
  );
};

export const DesktopSidebar = ({
  className,
  children,
  ...props
}: React.ComponentProps<typeof motion.div>) => {
  const { open, setOpen, animate } = useSidebar();
  return (
    <>
      <motion.div
        className={cn(
          "relative ml-2 mt-2 hidden h-full flex-shrink-0 rounded-md bg-card px-4 py-4 shadow-md md:flex md:h-[calc(100vh-2rem)] md:flex-col",
          className,
        )}
        // className="flex w-full flex-col  p-4 shadow-md lg:fixed lg:left-4 "
        animate={{
          width: animate ? (open ? "300px" : "70px") : "300px",
          transition: {
            type: "spring",
            stiffness: 100,
            damping: 15,
            duration: 0.3,
          },
        }}
        {...props}
      >
        <Button
          onClick={() => {
            setOpen(!open);
          }}
          variant="secondary"
          className="absolute -right-3 top-2 size-7 p-1 hover:bg-secondary"
        >
          <motion.span
            animate={{
              rotate: animate ? (open ? 180 : 0) : 0,
              transition: {
                duration: 0.3,
                ease: "easeInOut",
              },
            }}
          >
            <FaArrowRightLong />
          </motion.span>
        </Button>
        {children as React.ReactNode}
      </motion.div>
    </>
  );
};

export const MobileSidebar = ({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) => {
  const { open, setOpen } = useSidebar();
  return (
    <Sheet>
      <div
        className={cn(
          "flex  w-full flex-row items-center justify-between  bg-card px-4 py-3  md:hidden",
        )}
        {...props}
      >
        <div className="z-20 flex w-full items-center justify-start gap-2">
          <Image
            src="/favicon.svg"
            alt="brand"
            className="h-8 w-8  dark:invert-0 invert"
            width={8}
            height={8}
          />
          <h5>memoize</h5>
        </div>
        <SheetTrigger asChild>
          <Button
            size="icon"
            onClick={() => setOpen(true)}
            className="p-0 lg:hidden"
          >
            <Menu className="h-6 w-6" />
          </Button>
        </SheetTrigger>
      </div>
      <SheetContent
        className={cn(
          "w-[90dvw] border-r-[1px] bg-card p-6 backdrop-blur-xl xs:w-[440px]",
        )}
      >
        <div>
          {/* {metadata?.currentPlan !== "FREE" && ( */}
          {/* <div className="flex w-full justify-center">
            <ProfileButton />
          </div> */}
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
};

interface SidebarLinkProps extends Omit<LinkProps, "href"> {
  link: Links;
  className?: string;
}

export const SidebarLink = ({
  link,
  className,
  ...props
}: SidebarLinkProps) => {
  const { open, animate } = useSidebar();
  return (
    <Link
      onClick={link.onClick}
      href={link.href}
      className={cn(
        "group/sidebar flex items-center justify-center gap-3 rounded-md p-2 hover:bg-accent",
        open && "justify-start p-3",
        className,
      )}
      {...props}
    >
      {!open ? (
        <ToolTipSimple position="right" content={link.label}>
          <span className="text-xl">{link.icon}</span>
        </ToolTipSimple>
      ) : (
        link.icon
      )}
      <motion.span
        animate={{
          display: animate ? (open ? "inline-block" : "none") : "inline-block",
          opacity: animate ? (open ? 1 : 0) : 1,
        }}
        className="!m-0 inline-block whitespace-pre !p-0 text-sm text-foreground transition duration-150 group-hover/sidebar:translate-x-1 dark:text-neutral-200"
      >
        {link.label}
      </motion.span>
    </Link>
  );
};
