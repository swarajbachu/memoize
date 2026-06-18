"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";

const PATHS = [
  {
    d: "M241.461 -19.625V7.85497L301.26 68.5597V123.375",
    id: "line1",
  },
  {
    d: "M284.045 123.375V77.6201L221.528 15.1033V-19.625",
    id: "line2",
  },
  {
    d: "M109.641 -20.625L152.669 26.8818H210.656L265.924 83.0563V123.375",
    id: "line3",
  },
  {
    d: "M247.803 122.875V91.2107L200.689 44.0966H79.2799L15.1406 -21.125",
    id: "line4",
  },
  {
    d: "M0.640625 -5.625L69.3134 62.2174H192.535L229.683 98.459V123.375",
    id: "line5",
  },
] as const;

const FALLBACK_PATH_LENGTHS = PATHS.map(() => 500);

// Length of the visible moving segment. The dash pattern period is
// `DASH + pathLength`, so the animation must shift the offset by exactly
// that amount for a seamless, continuous loop (no abrupt jump on repeat).
const DASH = 30;

export function AnimatedSVG2() {
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
      width="303"
      height="124"
      viewBox="0 0 303 124"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Main SVG paths */}
      <path
        d="M241.461 -19.625V7.85497L301.26 68.5597V123.375"
        stroke="#F2F2F2"
        strokeWidth="1.81208"
      />
      <path
        d="M284.045 123.375V77.6201L221.528 15.1033V-19.625"
        stroke="#F2F2F2"
        strokeWidth="1.81208"
      />
      <path
        d="M109.641 -20.625L152.669 26.8818H210.656L265.924 83.0563V123.375"
        stroke="#F2F2F2"
        strokeWidth="1.81208"
      />
      <path
        d="M247.803 122.875V91.2107L200.689 44.0966H79.2799L15.1406 -21.125"
        stroke="#F2F2F2"
        strokeWidth="1.81208"
      />
      <path
        d="M0.640625 -5.625L69.3134 62.2174H192.535L229.683 98.459V123.375"
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
              style={{
                filter: "drop-shadow(0 0 12px #D7FF45)",
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
