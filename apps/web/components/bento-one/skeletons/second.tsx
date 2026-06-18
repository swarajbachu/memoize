"use client";

import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import { IconBrandGithubFilled } from "@tabler/icons-react";
import Image from "next/image";
import { SlackIcon } from "@/icons/brand";

export const SkeletonTwo = () => {
  const cards = [
    {
      title: "+128 −34 across 6 files",
      badge: "diff",
      icon: <SlackIcon className="size-4" />,
    },
    {
      title: "feat: add worktree per chat",
      badge: "commit",
      icon: <IconBrandGithubFilled className="size-4 text-foreground" />,
    },
    {
      title: "PR #214 ready to open",
      badge: "pull request",
      icon: (
        <Image
          src="/manu.webp"
          alt="PR ready"
          width={20}
          height={20}
          className="rounded-full"
        />
      ),
    },
  ];
  return (
    <div className="relative flex h-full w-full items-center justify-end">
      <motion.svg
        width="213"
        height="216"
        viewBox="0 0 213 216"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="absolute inset-x-0 top-2 mx-auto size-40 mask-b-from-50%"
      >
        <path
          d="M213 109.5C213 168.318 165.318 216 106.5 216C47.6817 216 0 168.318 0 109.5C0 50.6812 47.6817 2.99951 106.5 2.99951C165.318 2.99951 213 50.6812 213 109.5ZM46.237 109.5C46.237 142.782 73.2177 169.762 106.5 169.762C139.782 169.762 166.763 142.782 166.763 109.5C166.763 76.2172 139.782 49.2365 106.5 49.2365C73.2177 49.2365 46.237 76.2172 46.237 109.5Z"
          fill="#F8F8F8"
        />
        <motion.path
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}
          d="M86.0381 4.98367C63.9665 9.3048 43.8295 20.5024 28.5131 36.9716C13.1967 53.4408 3.48731 74.3362 0.776455 96.6628C-1.9344 118.989 2.49248 141.601 13.4226 161.257C24.3527 180.913 41.225 196.604 61.6212 206.082C82.0173 215.559 104.89 218.336 126.962 214.015C149.033 209.694 169.171 198.497 184.487 182.027C199.803 165.558 209.513 144.663 212.224 122.336C214.934 100.01 210.508 77.3979 199.577 57.7419L159.168 80.2125C165.353 91.3348 167.858 104.13 166.324 116.763C164.79 129.397 159.296 141.22 150.629 150.539C141.962 159.858 130.568 166.195 118.078 168.64C105.589 171.085 92.6465 169.513 81.1053 164.151C69.5642 158.788 60.017 149.909 53.8322 138.787C47.6474 127.664 45.1425 114.869 46.6764 102.236C48.2103 89.6023 53.7044 77.7787 62.3712 68.4596C71.0379 59.1406 82.4325 52.8044 94.9216 50.3593L86.0381 4.98367Z"
          fill="url(#paint0_linear_1_614)"
        />
        <motion.g
          initial={{ rotate: 0 }}
          whileInView={{ rotate: 360 }}
          viewport={{ once: true }}
          transition={{
            duration: 2,
            delay: 0.3,
            ease: "easeInOut",
          }}
          style={{
            transformOrigin: "106.5px 109.5px",
            transformBox: "view-box",
          }}
        >
          <rect
            x="84"
            y="0.380371"
            width="2"
            height="56"
            rx="1"
            transform="rotate(-10.9638 84 0.380371)"
            fill="white"
          />
          <rect
            x="84"
            y="0.380371"
            width="2"
            height="56"
            rx="1"
            transform="rotate(-10.9638 84 0.380371)"
            fill="url(#paint1_linear_1_614)"
          />
        </motion.g>
        <defs>
          <motion.linearGradient
            id="paint0_linear_1_614"
            x1="13"
            y1="123"
            x2="121"
            y2="-2.50001"
            initial={{
              x1: 13,
              y1: 0,
              x2: 121,
              y2: 0,
            }}
            whileInView={{
              x1: 13,
              y1: 123,
              x2: 121,
              y2: -2.50001,
            }}
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#F0F0F0" />
            <stop offset="1" stopColor="#EDE5CB" />
          </motion.linearGradient>
          <linearGradient
            id="paint1_linear_1_614"
            x1="88.669"
            y1="27.3238"
            x2="72.6514"
            y2="27.5191"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#F1F1F1" />
            <stop offset="1" stopColor="#C9B76E" />
          </linearGradient>
        </defs>
      </motion.svg>
      <CardStack items={cards} />
    </div>
  );
};

let interval: NodeJS.Timeout;

type Card = {
  title: string;
  badge: string;
  icon: React.ReactNode;
};

export const CardStack = ({
  items,
  offset,
  scaleFactor,
}: {
  items: Card[];
  offset?: number;
  scaleFactor?: number;
}) => {
  const CARD_OFFSET = offset || 10;
  const SCALE_FACTOR = scaleFactor || 0.06;
  const [cards, setCards] = useState<Card[]>(items);

  const startFlipping = () => {
    interval = setInterval(() => {
      setCards((prevCards: Card[]) => {
        const newArray = [...prevCards]; // create a copy of the array
        newArray.unshift(newArray.pop()!); // move the last element to the front
        return newArray;
      });
    }, 5000);
  };

  useEffect(() => {
    startFlipping();
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative mb-8 w-full">
      {cards.map((card, index) => {
        return (
          <motion.div
            key={card.title}
            className="absolute flex h-20 w-full flex-col justify-between rounded-lg bg-secondary p-4 shadow ring-1 shadow-black/40 ring-white/10"
            style={{
              transformOrigin: "top center",
            }}
            animate={{
              top: index * -CARD_OFFSET,
              scale: 1 - index * SCALE_FACTOR, // decrease scale for cards that are behind
              zIndex: cards.length - index, //  decrease z-index for the cards that are behind
            }}
          >
            <div className="flex justify-between">
              <span className="font-mono text-xs text-muted-foreground">
                {card.badge}
              </span>
              {card.icon}
            </div>
            <p className="text-base text-foreground">{card.title}</p>
          </motion.div>
        );
      })}
    </div>
  );
};
