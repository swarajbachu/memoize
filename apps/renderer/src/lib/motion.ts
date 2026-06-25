/**
 * Single source of motion taste for the renderer.
 *
 * Everything that animates an app-level surface (sidebars, queue, messages,
 * tabs, banners) pulls its timing/easing/variants from here so the feel stays
 * consistent and tunable in one place — no inline magic numbers at call sites.
 *
 * Intensity target: "between subtle and expressive". A gentle spring that
 * settles with a hair of overshoot (never bouncy), short durations, small
 * offsets. `<MotionConfig reducedMotion="user">` in `app.tsx` makes every one
 * of these auto-snap under OS Reduce Motion, so individual call sites don't
 * need their own guards.
 */
import type { Transition, Variants } from "motion/react";

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

/**
 * The default app spring. Moderate stiffness + slightly-under-critical damping
 * gives a quick move that settles with a barely-perceptible overshoot. Used for
 * most enter/move animations.
 */
export const springSoft: Transition = {
  type: "spring",
  stiffness: 520,
  damping: 36,
  mass: 1,
};

/**
 * Snappier spring for small UI accents that should feel instant but alive —
 * the sliding active-tab indicator, drag settle, chip reorder.
 */
export const springSnappy: Transition = {
  type: "spring",
  stiffness: 700,
  damping: 40,
  mass: 0.8,
};

/**
 * Tween fallback for properties a spring reads poorly on (opacity, height
 * collapse). ~200ms ease-out sits in the "between subtle and expressive" band.
 */
export const easeQuick: Transition = {
  type: "tween",
  duration: 0.2,
  ease: [0.22, 1, 0.36, 1], // easeOutQuint-ish
};

/** Even quicker tween for pure fades. */
export const easeFast: Transition = {
  type: "tween",
  duration: 0.14,
  ease: [0.22, 1, 0.36, 1],
};

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

/**
 * Message-style entrance: fade up a few px on enter. Exit is a quick fade so a
 * removed item doesn't drag layout. Used for chat rows.
 */
export const fadeSlideUp: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: springSoft },
  exit: { opacity: 0, y: 4, transition: easeFast },
};

/**
 * List item that grows/collapses its own height on enter/exit (queue chips,
 * sidebar rows). Pair with `layout` for FLIP reorder. `height: auto` lets the
 * item measure its natural height; the collapse on exit avoids a hard pop.
 */
export const listItem: Variants = {
  initial: { opacity: 0, height: 0, y: -6 },
  animate: {
    opacity: 1,
    height: "auto",
    y: 0,
    transition: { ...springSoft, opacity: easeQuick },
  },
  exit: {
    opacity: 0,
    height: 0,
    y: -6,
    transition: easeQuick,
  },
};

/**
 * Banner / tray that should grow and shrink the layout smoothly instead of
 * popping in. Same shape as `listItem` but without the y nudge — these are
 * full-width strips, so vertical collapse alone reads cleanly.
 */
export const collapseY: Variants = {
  initial: { opacity: 0, height: 0 },
  animate: {
    opacity: 1,
    height: "auto",
    transition: { ...springSoft, opacity: easeQuick },
  },
  exit: { opacity: 0, height: 0, transition: easeQuick },
};

/**
 * Tab add/remove: scale + fade so a new tab pops into place and a closed one
 * deflates. Width is animated via `layout` on the element itself.
 */
export const tabPop: Variants = {
  initial: { opacity: 0, scale: 0.92 },
  animate: { opacity: 1, scale: 1, transition: springSnappy },
  exit: { opacity: 0, scale: 0.92, transition: easeFast },
};

/**
 * Per-child stagger for a freshly-arrived turn's body groups. Small, so a
 * multi-part assistant turn cascades in rather than appearing all at once.
 */
export const STAGGER_CHILD_S = 0.035;
