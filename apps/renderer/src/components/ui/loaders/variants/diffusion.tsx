import type { CSSProperties } from "react";
import { coords3 } from "~/lib/grid-coords";
import { loaderStyle, type LoaderProps } from "~/lib/loader-props";
import styles from "./diffusion.module.css";

// Random scatter — each dot fires at a pseudo-random phase for a twinkle feel.
export function Diffusion(props: LoaderProps = {}) {
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
          style={{ "--phase": c.rand } as CSSProperties}
        />
      ))}
    </div>
  );
}
