"use client";
import { useRef, useMemo } from "react";
import DottedMap from "dotted-map";
import Image from "next/image";
import { motion } from "motion/react";

type PinType = "avatar" | "datacenter";

interface Pin {
  top: string;
  left: string;
  label: string;
  type: PinType;
  image?: string;
}

interface SkeletonThreeProps {
  pins?: Pin[];
  defaultAvatarImage?: string;
}

const defaultPins: Pin[] = [
  // Avatars
  {
    top: "32%",
    left: "68%",
    label: "India",
    type: "avatar",
    image: "/manu.webp",
  },
  {
    top: "72%",
    left: "82%",
    label: "Australia",
    type: "avatar",
    image:
      "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=1760&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  },
  {
    top: "28%",
    left: "15%",
    label: "California",
    type: "avatar",
    image:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=1287&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  },
  {
    top: "40%",
    left: "52%",
    label: "Dubai",
    type: "avatar",
    image:
      "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?q=80&w=2670&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  },
  {
    top: "65%",
    left: "35%",
    label: "Brazil",
    type: "avatar",
    image:
      "https://images.unsplash.com/photo-1580489944761-15a19d654956?q=80&w=1361&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  },
  // Providers
  { top: "35%", left: "22%", label: "Claude Code", type: "datacenter" },
  { top: "22%", left: "47%", label: "Codex", type: "datacenter" },
  { top: "26%", left: "53%", label: "Cursor", type: "datacenter" },
  { top: "38%", left: "78%", label: "Gemini", type: "datacenter" },
  { top: "30%", left: "85%", label: "Grok", type: "datacenter" },
];

export const SkeletonThree = ({
  pins = defaultPins,
  defaultAvatarImage = "/manu.webp",
}: SkeletonThreeProps) => {
  const svgRef = useRef<SVGSVGElement>(null);

  const svgMap = useMemo(() => {
    const map = new DottedMap({ height: 100, grid: "diagonal" });

    return map.getSVG({
      radius: 0.22,
      color: "#404040",
      shape: "circle",
      backgroundColor: "transparent",
    });
  }, []);

  // Parse the SVG to extract viewBox
  const viewBox = useMemo(() => {
    const match = svgMap.match(/viewBox="([^"]+)"/);
    return match ? match[1] : "0 0 120 60";
  }, [svgMap]);

  // Extract just the inner content of the SVG
  const svgContent = useMemo(() => {
    const match = svgMap.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
    return match ? match[1] : "";
  }, [svgMap]);

  return (
    <div className="absolute inset-0 w-full overflow-hidden bg-neutral-950 mask-t-from-50% mask-radial-from-90%">
      <svg
        ref={svgRef}
        viewBox={viewBox}
        className="h-full w-full"
        preserveAspectRatio="xMidYMid slice"
        dangerouslySetInnerHTML={{ __html: svgContent }}
      />

      {/* Animated pulse rings on pin locations */}
      <PulsingDots pins={pins} defaultAvatarImage={defaultAvatarImage} />
    </div>
  );
};

interface PulsingDotsProps {
  pins: Pin[];
  defaultAvatarImage: string;
}

// Pulsing dots overlay for pin locations
const PulsingDots = ({ pins, defaultAvatarImage }: PulsingDotsProps) => {
  return (
    <>
      {pins.map((pin, i) => (
        <motion.div
          key={pin.label}
          className="absolute"
          style={{ top: pin.top, left: pin.left }}
          initial={{ opacity: 0, scale: 0 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{
            type: "spring",
            stiffness: 260,
            damping: 20,
            delay: i * 0.1,
          }}
        >
          {/* Outer pulse ring */}
          <motion.div
            className="absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/10"
            initial={{ scale: 0.5, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 + 0.2 }}
            animate={{
              scale: [1, 1.5, 1],
              opacity: [0.3, 0, 0.3],
            }}
            style={{
              animationDuration: "2s",
              animationIterationCount: "infinite",
            }}
          />

          {pin.type === "avatar" ? (
            <motion.div
              className="absolute -translate-x-1/2 -translate-y-1/2"
              initial={{ scale: 0.8 }}
              whileInView={{ scale: 1 }}
              viewport={{ once: true }}
              transition={{
                type: "spring",
                stiffness: 200,
                damping: 15,
                delay: i * 0.1 + 0.15,
              }}
            >
              <div className="relative h-7 w-7 overflow-hidden rounded-full border border-neutral-500 shadow-lg">
                <Image
                  src={pin.image || defaultAvatarImage}
                  alt={pin.label}
                  width={28}
                  height={28}
                  className="h-full w-full object-cover"
                />
              </div>
            </motion.div>
          ) : (
            <motion.div
              className="absolute -translate-x-1/2 -translate-y-1/2"
              initial={{ scale: 0, y: 20 }}
              whileInView={{ scale: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{
                type: "spring",
                stiffness: 300,
                damping: 20,
                delay: i * 0.1 + 0.15,
              }}
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full border border-neutral-500 bg-neutral-900 shadow-lg">
                <DataCenterIcon className="h-4 w-4 text-neutral-500" />
              </div>
            </motion.div>
          )}
        </motion.div>
      ))}
    </>
  );
};

// Placeholder data center icon - replace with your own
const DataCenterIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
    <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
    <line x1="6" y1="6" x2="6.01" y2="6" />
    <line x1="6" y1="18" x2="6.01" y2="18" />
  </svg>
);
