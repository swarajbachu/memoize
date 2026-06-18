import { SquareDots } from "@/components/square-dots";
import { IconPhotoScan } from "@tabler/icons-react";
import { motion } from "motion/react";
import React from "react";

export const SkeletonOne = () => {
  return (
    <>
      <motion.svg
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay: 0.3 }}
        className="absolute bottom-0 -left-40 z-40 rotate-45 fill-white/80 blur-3xl"
        width="100%"
        height="100%"
      >
        <ellipse cx="50%" cy="50%" rx="100" ry="60" />
      </motion.svg>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="bg-secondary relative z-40 h-full overflow-hidden rounded-lg border border-white/10"
      >
        <motion.div
          initial={{ y: 30 }}
          whileInView={{ y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}
          className="absolute inset-x-0 -bottom-4 mx-auto flex h-full w-[90%] flex-col rounded-lg bg-white/[0.06] p-2"
        >
          <div className="relative flex">
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: 0.4 }}
              className="flex items-center gap-1.5"
            >
              <div className="size-1.5 rounded-full bg-[#FF5F57]"></div>
              <div className="size-1.5 rounded-full bg-[#FFBD2E]"></div>
              <div className="size-1.5 rounded-full bg-[#28C840]"></div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, scaleX: 0 }}
              whileInView={{ opacity: 1, scaleX: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: 0.5 }}
              className="absolute inset-x-0 mx-auto h-2 w-32 rounded-full bg-white/10"
            ></motion.div>
          </div>
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="mt-3 flex w-full flex-1 flex-col rounded-lg bg-natural-black"
          >
            <div className="flex">
              <div className="flex w-full items-center justify-between px-1.5 py-1">
                <div className="size-2 rounded-full bg-white/20"></div>
                <div className="flex items-center gap-1">
                  <div className="h-1 w-3 rounded-full bg-white/10"></div>
                  <div className="h-1 w-3 rounded-full bg-white/10"></div>
                  <div className="h-1 w-3 rounded-full bg-white/10"></div>
                  <div className="ml-1 h-1.5 w-4 rounded-sm bg-white/20"></div>
                </div>
              </div>
            </div>
            <div className="flex flex-1 flex-col items-center justify-center px-2 py-3">
              {/* Headline */}
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                whileInView={{ opacity: 1, width: 128 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: 0.5 }}
                className="h-2 rounded-full bg-white/20"
              ></motion.div>
              {/* Subheading */}
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                whileInView={{ opacity: 1, width: 96 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: 0.6 }}
                className="mt-1.5 h-1 rounded-full bg-white/10"
              ></motion.div>
              {/* CTA Buttons */}
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: 0.7 }}
                className="mt-2 flex items-center gap-1"
              >
                <div className="h-2 w-8 rounded-sm bg-primary"></div>
                <div className="h-2 w-8 rounded-sm bg-white/10"></div>
              </motion.div>
              {/* Testimonial Profile Cards */}
              <motion.div
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: 0.8 }}
                className="mt-2 flex items-center gap-1"
              >
                <div className="size-3 rounded-full bg-white/10"></div>
                <div className="size-3 rounded-full bg-white/10"></div>
                <div className="size-3 rounded-full bg-white/10"></div>
                <div className="size-3 rounded-full bg-white/10"></div>
              </motion.div>
              {/* Hero Image */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: 0.9 }}
                className="mt-3 flex h-full w-3/4 items-center justify-center rounded-sm bg-white/5"
              >
                <IconPhotoScan className="size-6 text-muted-foreground" />
              </motion.div>
            </div>
          </motion.div>
        </motion.div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 0.2 }}
        viewport={{ once: true }}
        transition={{ duration: 1, delay: 0.5 }}
        className="absolute right-0 bottom-0 h-80 w-full mask-t-from-20% mask-b-from-90% mask-l-from-50%"
      >
        <SquareDots color="#ffffff" className="absolute inset-0 w-full" />
      </motion.div>
    </>
  );
};
