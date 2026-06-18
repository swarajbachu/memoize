"use client";

import { motion, type Variants } from "motion/react";
import Image from "next/image";

import { cn } from "@/lib/utils";

import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";

type WorkflowCard = {
  id: string;
  label: string;
  caption: string;
  className: string;
  heightClassName: string;
  screenshot: string;
  imageClassName?: string;
  priority?: boolean;
};

const showcases = [
  {
    id: "chat-timeline",
    label: "Full workspace",
    caption:
      "Streaming tool calls, thinking blocks, diffs, and errors in one readable thread.",
    className: "col-span-14",
    heightClassName: "h-[520px] md:h-[620px]",
    screenshot: "/assets/product/memoize-workspace.png",
    imageClassName: "object-contain object-center p-3 md:object-cover md:object-top md:p-0",
    priority: true,
  },
  {
    id: "pr-changes",
    label: "PR & Changes pane",
    caption: "Review diffs and compose commits without leaving the workspace.",
    className: "col-span-14 md:col-span-7 lg:col-span-5",
    heightClassName: "h-[360px]",
    screenshot: "/assets/product/memoize-changes.png",
    imageClassName: "object-contain object-center p-4",
  },
  {
    id: "worktrees",
    label: "Worktrees",
    caption: "A git worktree per chat keeps every agent on its own branch.",
    className: "col-span-14 md:col-span-7 lg:col-span-4",
    heightClassName: "h-[360px]",
    screenshot: "/assets/product/memoize-sidebar.png",
    imageClassName: "object-contain object-center p-4",
  },
  {
    id: "permissions",
    label: "Composer",
    caption:
      "Attach files, run slash commands, and steer agents from one composer.",
    className: "col-span-14 md:col-span-14 lg:col-span-5",
    heightClassName: "h-[360px]",
    screenshot: "/assets/product/memoize-composer.png",
    imageClassName: "object-contain object-center p-4",
  },
] satisfies WorkflowCard[];

const overlayItemVariants: Variants = {
  rest: { opacity: 1, y: 0 },
  hover: {
    opacity: 1,
    y: -4,
    transition: { type: "spring", stiffness: 300, damping: 24 },
  },
};

export const Projects = ({
  disabelHeader = false,
}: {
  disabelHeader?: boolean;
}) => {
  return (
    <section className="w-full">
      <Container className="relative flex w-full flex-col gap-20 overflow-hidden pt-40 pb-20 md:pt-65 md:pb-30 lg:pt-80 lg:pb-30">
        {!disabelHeader && (
          <div>
            <PageHeader>See memoize in action</PageHeader>
          </div>
        )}
        {/* grids */}
        <div
          className={cn(
            "z-10 grid grid-cols-14 gap-6",
            "*:data-[slot='card']:overflow-hidden *:data-[slot='card']:rounded-3xl",
          )}
        >
          {showcases.map((showcase) => (
            <motion.figure
              key={showcase.id}
              data-slot="card"
              initial="rest"
              animate="rest"
              whileHover="hover"
              className={cn(
                "group relative block overflow-hidden rounded-3xl bg-[#18191B] text-left shadow-2xl shadow-black/30",
                showcase.className,
                showcase.heightClassName,
              )}
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(205,255,36,0.10),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.015))]" />
              <div className="absolute inset-0">
                <Image
                  src={showcase.screenshot}
                  alt={showcase.label}
                  fill
                  priority={showcase.priority}
                  sizes="(min-width: 1024px) 50vw, 100vw"
                  className={cn(
                    "transition duration-500 group-hover:scale-[1.015]",
                    showcase.imageClassName,
                  )}
                />
                <div className="absolute inset-x-0 bottom-0 h-32 bg-linear-to-t from-[#18191B] via-[#18191B]/80 to-transparent" />
              </div>
              <motion.figcaption
                variants={overlayItemVariants}
                className="absolute right-5 bottom-5 left-5 flex flex-col gap-2 rounded-2xl bg-black/70 p-4 backdrop-blur-xl md:right-6 md:bottom-6 md:left-6 md:max-w-xl"
              >
                <div className="w-fit rounded-full bg-primary px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-primary-foreground">
                  {showcase.label}
                </div>
                <p className="text-natural-white/85 text-sm leading-5 font-medium md:text-base md:leading-6">
                  {showcase.caption}
                </p>
              </motion.figcaption>
            </motion.figure>
          ))}
        </div>
      </Container>
    </section>
  );
};
