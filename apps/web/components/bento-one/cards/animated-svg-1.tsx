"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";

const PATHS = [
  {
    d: "M12.427 165.594V126.58L32.3598 103.929H200.148",
    id: "line1",
  },
  {
    d: "M200.148 85.8084H27.8296L0.648438 113.896",
    id: "line2",
  },
  {
    d: "M0.648438 70.4057H200.148",
    id: "line3",
  },
  {
    d: "M200.148 50.4728H22.3934L0.648438 30.54",
    id: "line4",
  },
  {
    d: "M0.648438 0.640625L32.3598 32.352H200.148",
    id: "line5",
  },
] as const;

const FALLBACK_PATH_LENGTHS = PATHS.map(() => 500);

// Length of the visible moving segment. The dash pattern period is
// `DASH + pathLength`, so the animation must shift the offset by exactly
// that amount for a seamless, continuous loop (no abrupt jump on repeat).
const DASH = 60;

export function AnimatedSVG() {
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
      width="201"
      height="166"
      viewBox="0 0 201 166"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Main SVG paths */}
      <path
        d="M12.427 165.594V126.58L32.3598 103.929H200.148"
        stroke="#F2F2F2"
        strokeWidth="1.81208"
      />
      <path
        d="M200.148 85.8084H27.8296L0.648438 113.896"
        stroke="#F2F2F2"
        strokeWidth="1.81208"
      />
      <path
        d="M0.648438 70.4057H200.148"
        stroke="#F2F2F2"
        strokeWidth="1.81208"
      />
      <path
        d="M200.148 50.4728H22.3934L0.648438 30.54"
        stroke="#F2F2F2"
        strokeWidth="1.81208"
      />
      <path
        d="M0.648438 0.640625L32.3598 32.352H200.148"
        stroke="#F2F2F2"
        strokeWidth="1.81208"
      />

      {/* Animated tail path for each main path */}
      {PATHS.map((path, index) => {
        const pathLength = pathLengths[index] ?? 500;
        return (
          <g key={path.id}>
            {/* Tail path that follows the main path */}
            <motion.path
              d={path.d}
              stroke="url(#tailGradient)"
              strokeWidth="2.5"
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${DASH} ${pathLength}`}
              style={{
                filter: "blur(0.4px)", // subtle glow
              }}
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
