import type { CSSProperties } from "react";
import { coords3 } from "~/lib/grid-coords";
import { loaderStyle, type LoaderProps } from "~/lib/loader-props";
import styles from "./token-stream.module.css";

// Column wave — three vertical columns flash in sequence left → right.
export function TokenStream(props: LoaderProps = {}) {
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
          style={{ "--phase": c.col / 3 } as CSSProperties}
        />
      ))}
    </div>
  );
}
