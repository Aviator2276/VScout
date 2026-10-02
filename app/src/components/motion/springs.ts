// Motion presets (ui-design-system §10.2). Animate transform and opacity only; never `all`.
export const springs = {
  /** press, toggle, segmented thumb */
  snappy: { type: "spring", visualDuration: 0.25, bounce: 0 },
  /** sheets, layout reflow */
  smooth: { type: "spring", visualDuration: 0.35, bounce: 0.1 },
  /** drop into place, success */
  bouncy: { type: "spring", visualDuration: 0.4, bounce: 0.25 },
} as const
