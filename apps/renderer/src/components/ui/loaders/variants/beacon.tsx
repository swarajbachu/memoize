import type { CSSProperties } from "react";
import { coords3 } from "~/lib/grid-coords";
import { loaderStyle, type LoaderProps } from "~/lib/loader-props";
import styles from "./beacon.module.css";

// Clockwise perimeter sweep around the 3×3 center.
export function Beacon(props: LoaderProps = {}) {
  return (
    <div
      className={`loader ${styles.loader}${props.className ? ` ${props.className}` : ""}`}
      style={loaderStyle(props, { "--grid-size": 3 })}
      role="status"
      aria-label={props["aria-label"] ?? "Loading"}
    >
      {coords3.map((c) => (
        <span
          key={c.i}
          className="dot"
          style={{ "--phase": c.angle } as CSSProperties}
        />
      ))}
    </div>
  );
}
