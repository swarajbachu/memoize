import type { CSSProperties } from 'react';

export type LoaderProps = {
  /** Pixel size of each dot. Default 4. */
  dotSize?: number;
  /** Padding around each dot inside its grid cell, in px. Default ~1.5 (gap of 3). */
  cellPadding?: number;
  /** Animation speed multiplier. 1 = default, 2 = 2x faster. Default 1. */
  speed?: number;
  /** Dot color. Any CSS color (hex, rgb, named). Default inherits from --color-dot. */
  color?: string;
  /** Pass-through className for the loader root. */
  className?: string;
  /** Override the default 'Loading' aria-label. */
  'aria-label'?: string;
};

export function loaderStyle(
  props: LoaderProps,
  extra?: Record<string, string | number>,
): CSSProperties {
  const style: Record<string, string | number> = {};
  if (props.dotSize != null) style['--dot-size'] = `${props.dotSize}px`;
  if (props.cellPadding != null) style['--dot-gap'] = `${props.cellPadding * 2}px`;
  if (props.speed != null) style['--speed'] = props.speed;
  if (props.color != null) style['--color-dot'] = props.color;
  if (extra) Object.assign(style, extra);
  return style as CSSProperties;
}
