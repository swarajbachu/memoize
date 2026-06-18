"use client";

import React from "react";
import { motion } from "motion/react";

const mulberry32 = (seed: number) => {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

export const GridPattenDepth = () => {
  const delays = React.useMemo(() => {
    const count = 13;
    const rand = mulberry32(26372853);
    const minDelay = 0.05;
    const maxDelay = 0.45;
    return Array.from({ length: count }, () => {
      const t = rand();
      return minDelay + t * (maxDelay - minDelay);
    });
  }, []);

  return (
    <svg
      width="497"
      height="346"
      viewBox="0 0 497 346"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <mask
        id="mask0_2637_2853"
        style={{ maskType: "alpha" }}
        maskUnits="userSpaceOnUse"
        x="0"
        y="0"
        width="497"
        height="346"
      >
        <rect
          width="496.8"
          height="345.6"
          fill="url(#paint0_linear_2637_2853)"
        />
      </mask>
      <g mask="url(#mask0_2637_2853)">
        <mask
          id="mask1_2637_2853"
          style={{ maskType: "alpha" }}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="497"
          height="346"
        >
          <rect
            width="496.8"
            height="345.6"
            fill="url(#paint1_linear_2637_2853)"
          />
        </mask>
        <g mask="url(#mask1_2637_2853)">
          <motion.rect
            x="105.117"
            y="28.7969"
            width="72"
            height="72"
            fill="#D7FF45"
            fillOpacity="0.5"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 0.5, ease: "easeOut", delay: delays[0] }}
          />
          <g opacity="0.6" filter="url(#filter0_d_2637_2853)">
            <motion.rect
              x="249.117"
              y="28.7969"
              width="72"
              height="72"
              fill="#D7FF45"
              fillOpacity="0.5"
              shapeRendering="crispEdges"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, amount: 0.6 }}
              transition={{ duration: 0.5, ease: "easeOut", delay: delays[1] }}
            />
          </g>
          <g opacity="0.6" filter="url(#filter1_di_2637_2853)">
            <motion.rect
              x="177.117"
              y="100.797"
              width="72"
              height="72"
              fill="#D7FF45"
              fillOpacity="0.5"
              shapeRendering="crispEdges"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, amount: 0.6 }}
              transition={{ duration: 0.5, ease: "easeOut", delay: delays[2] }}
            />
          </g>
          <motion.rect
            x="249.117"
            y="100.797"
            width="72"
            height="72"
            fill="#D7FF45"
            fillOpacity="0.5"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 0.45 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 0.5, ease: "easeOut", delay: delays[3] }}
          />
          <motion.rect
            x="321.117"
            y="100.797"
            width="72"
            height="72"
            fill="#D7FF45"
            fillOpacity="0.5"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 0.3 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 0.5, ease: "easeOut", delay: delays[4] }}
          />
          <motion.rect
            x="105.117"
            y="172.797"
            width="72"
            height="72"
            fill="#D7FF45"
            fillOpacity="0.5"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 0.6 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 0.5, ease: "easeOut", delay: delays[5] }}
          />
          <motion.rect
            x="177.117"
            y="172.797"
            width="72"
            height="72"
            fill="#D7FF45"
            fillOpacity="0.5"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 0.45 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 0.5, ease: "easeOut", delay: delays[6] }}
          />
          <g opacity="0.3" filter="url(#filter2_d_2637_2853)">
            <motion.rect
              x="249.117"
              y="172.797"
              width="72"
              height="72"
              fill="#D7FF45"
              fillOpacity="0.5"
              shapeRendering="crispEdges"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, amount: 0.6 }}
              transition={{ duration: 0.5, ease: "easeOut", delay: delays[7] }}
            />
          </g>
          <motion.rect
            x="105.117"
            y="100.797"
            width="72"
            height="72"
            fill="#D7FF45"
            fillOpacity="0.5"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 0.3 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 0.5, ease: "easeOut", delay: delays[8] }}
          />
          <motion.rect
            x="177.117"
            y="28.7969"
            width="72"
            height="72"
            fill="#D7FF45"
            fillOpacity="0.5"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 0.3 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 0.5, ease: "easeOut", delay: delays[9] }}
          />
          <motion.rect
            x="321.117"
            y="172.797"
            width="72"
            height="72"
            fill="#D7FF45"
            fillOpacity="0.5"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 0.15 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 0.5, ease: "easeOut", delay: delays[10] }}
          />
          <motion.rect
            x="177.117"
            y="244.797"
            width="72"
            height="72"
            fill="#D7FF45"
            fillOpacity="0.5"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 0.3 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 0.5, ease: "easeOut", delay: delays[11] }}
          />
          <motion.rect
            x="249.117"
            y="244.797"
            width="72"
            height="72"
            fill="#D7FF45"
            fillOpacity="0.5"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 0.15 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 0.5, ease: "easeOut", delay: delays[12] }}
          />
        </g>
      </g>
      <defs>
        <filter
          id="filter0_d_2637_2853"
          x="245.117"
          y="28.7969"
          width="80"
          height="80"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dy="4" />
          <feGaussianBlur stdDeviation="2" />
          <feComposite in2="hardAlpha" operator="out" />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0.792157 0 0 0 0 0.713726 0 0 0 0 0.596078 0 0 0 1 0"
          />
          <feBlend
            mode="normal"
            in2="BackgroundImageFix"
            result="effect1_dropShadow_2637_2853"
          />
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="effect1_dropShadow_2637_2853"
            result="shape"
          />
        </filter>
        <filter
          id="filter1_di_2637_2853"
          x="167.117"
          y="94.7969"
          width="92"
          height="92"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dy="4" />
          <feGaussianBlur stdDeviation="5" />
          <feComposite in2="hardAlpha" operator="out" />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0.790264 0 0 0 0 0.712473 0 0 0 0 0.595785 0 0 0 1 0"
          />
          <feBlend
            mode="normal"
            in2="BackgroundImageFix"
            result="effect1_dropShadow_2637_2853"
          />
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="effect1_dropShadow_2637_2853"
            result="shape"
          />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dy="12" />
          <feGaussianBlur stdDeviation="8" />
          <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.5 0"
          />
          <feBlend
            mode="normal"
            in2="shape"
            result="effect2_innerShadow_2637_2853"
          />
        </filter>
        <filter
          id="filter2_d_2637_2853"
          x="245.117"
          y="172.797"
          width="80"
          height="80"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dy="4" />
          <feGaussianBlur stdDeviation="2" />
          <feComposite in2="hardAlpha" operator="out" />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0"
          />
          <feBlend
            mode="normal"
            in2="BackgroundImageFix"
            result="effect1_dropShadow_2637_2853"
          />
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="effect1_dropShadow_2637_2853"
            result="shape"
          />
        </filter>
        <linearGradient
          id="paint0_linear_2637_2853"
          x1="100.2"
          y1="172.8"
          x2="402.48"
          y2="172.8"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopOpacity="0" />
          <stop offset="0.354383" />
          <stop offset="0.79624" />
          <stop offset="1" stopOpacity="0" />
        </linearGradient>
        <linearGradient
          id="paint1_linear_2637_2853"
          x1="249.12"
          y1="23.76"
          x2="248.4"
          y2="327"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopOpacity="0" />
          <stop offset="0.397032" />
          <stop offset="0.70269" />
          <stop offset="1" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
};

