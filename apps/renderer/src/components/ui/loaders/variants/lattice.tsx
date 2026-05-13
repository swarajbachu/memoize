import type { CSSProperties } from "react";
import { coords3 } from "~/lib/grid-coords";
import { loaderStyle, type LoaderProps } from "~/lib/loader-props";
import styles from "./lattice.module.css";

// Anti-diagonal sweep — top-right → bottom-left.
export function Lattice(props: LoaderProps = {}) {
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
          style={{ "--phase": c.antiDiag / 5 } as CSSProperties}
        />
      ))}
    </div>
  );
}
