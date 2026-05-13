import type { CSSProperties } from "react";
import { coords3 } from "~/lib/grid-coords";
import { loaderStyle, type LoaderProps } from "~/lib/loader-props";
import styles from "./orbit.module.css";

// Counter-clockwise perimeter sweep (Beacon's mirror).
export function Orbit(props: LoaderProps = {}) {
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
          style={{ "--phase": 1 - c.angle } as CSSProperties}
        />
      ))}
    </div>
  );
}
