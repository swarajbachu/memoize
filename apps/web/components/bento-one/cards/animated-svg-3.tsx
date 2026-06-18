"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";

const PATHS = [
  {
    d: "M118.875 0V64.2816L169.613 115.926V142",
    id: "line1",
  },
  {
    d: "M99.8516 0V76.966L144.664 121V142",
    id: "line2",
  },
  {
    d: "M82.6391 0V83.3087L30.1641 142.5M63.6122 0V74.2483L0.664062 142.5",
    id: "line3",
  },
  {
    d: "M136.094 0V51.5975L178.678 96.8995H296.463",
    id: "line4",
  },
] as const;

const FALLBACK_PATH_LENGTHS = PATHS.map(() => 500);

// Length of the visible moving segment. The dash pattern period is
// `DASH + pathLength`, so the animation must shift the offset by exactly
// that amount for a seamless, continuous loop (no abrupt jump on repeat).
const DASH = 30;

export function AnimatedSVG3() {
  const [pathLengths, setPathLengths] = useState<number[]>(FALLBACK_PATH_LENGTHS);

  useEffect(() => {
    const measuredLengths = PATHS.map((path) => {
      try {
        const svgPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        svgPath.setAttribute("d", path.d);
        return svgPath.getTotalLength();
      } catch {
        return 500;
      }
    });

    const frame = window.requestAnimationFrame(() => {
      setPathLengths(measuredLengths);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <svg
      width="167"
      height="56"
      viewBox="0 0 167 56"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Main SVG paths */}
      <path
        d="M118.875 0V64.2816L169.613 115.926V142"
        stroke="#F2F2F2"
        strokeWidth="1.81208"
      />
      <path
        d="M99.8516 0V76.966L144.664 121V142"
        stroke="#F2F2F2"
        strokeWidth="1.81208"
      />
      <path
        d="M82.6391 0V83.3087L30.1641 142.5M63.6122 0V74.2483L0.664062 142.5"
        stroke="#F2F2F2"
        strokeWidth="1.81208"
      />
      <path
        d="M136.094 0V51.5975L178.678 96.8995H296.463"
        stroke="#F2F2F2"
        strokeWidth="1.81208"
      />

      {/* Animated tail path for each main path */}
      {PATHS.map((path, index) => {
        const pathLength = pathLengths[index] ?? 500;
        return (
          <g key={path.id}>
            {/* Main tail */}
            <motion.path
              d={path.d}
              stroke="url(#tailGradient)"
              strokeWidth="2.5"
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${DASH} ${pathLength}`}
              initial={{ strokeDashoffset: 0 }}
              animate={{
                strokeDashoffset: -(pathLength + DASH),
              }}
              transition={{
                duration: 5,
                ease: "linear",
                repeat: Infinity,
              }}
            />

            {/* Glowing trail */}
            <motion.path
              d={path.d}
              stroke="url(#tailGradient)"
              strokeWidth="1.5"
              strokeLinecap="round"
              fill="none"
              opacity="0.3"
              strokeDasharray={`${DASH} ${pathLength}`}
              initial={{ strokeDashoffset: 0 }}
              animate={{
                strokeDashoffset: -(pathLength + DASH),
              }}
              transition={{
                duration: 5,
                ease: "linear",
                repeat: Infinity,
              }}
            />
          </g>
        );
      })}
      <defs>
        <linearGradient id="tailGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#D7FF45" stopOpacity="0" />
          <stop offset="50%" stopColor="#D7FF45" stopOpacity="1" />
          <stop offset="100%" stopColor="#D7FF45" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}
