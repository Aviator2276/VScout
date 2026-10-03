// The center of the Sync Status notch (features/sync-status.md S1): four bars that rise left to right,
// lit by connection quality. Connecting sweeps them in a loop; offline drops them one by one and an
// airplane swoops in; attention replaces them with an amber triangle. Every state differs in shape,
// not only color.
import { AnimatePresence, m, useReducedMotion } from "motion/react"
import { Plane, TriangleAlert } from "@/components/icons/icon"
import { springs } from "@/components/motion/springs"

export type ConnectionShown =
  | { kind: "bars"; quality: number; sweeping: boolean }
  | { kind: "offline" }
  | { kind: "attention" }

const BARS = [
  { x: 3, h: 5 },
  { x: 8, h: 9 },
  { x: 13, h: 13 },
  { x: 18, h: 17 },
] as const
const BASE = 20.5
/** unlit bars: the pill's foreground (--notch-fg) at low opacity */
const DIM = 0.25

function Bars({
  quality,
  sweeping,
  dropped,
}: {
  quality: number
  sweeping: boolean
  /** offline: every bar collapses, one after another */
  dropped: boolean
}) {
  const reduced = useReducedMotion() ?? false
  return (
    <svg aria-hidden viewBox="0 0 24 24" width="100%" height="100%">
      {BARS.map((b, i) => {
        const h = dropped ? 1.5 : b.h
        const lit = !dropped && !sweeping && i < quality
        return (
          <m.rect
            key={b.x}
            x={b.x}
            width={3}
            rx={1.5}
            initial={false}
            fill="var(--notch-fg)"
            animate={{
              height: h,
              y: BASE - h,
              // sweeping bars pulse; dropped stubs fade away under the airplane
              opacity:
                sweeping && !reduced
                  ? [0.2, 0.9, 0.2]
                  : sweeping
                    ? 0.5
                    : dropped
                      ? 0
                      : lit
                        ? 1
                        : DIM,
            }}
            transition={{
              height: {
                ...springs.smooth,
                delay: dropped ? (3 - i) * 0.07 : i * 0.05,
              },
              y: {
                ...springs.smooth,
                delay: dropped ? (3 - i) * 0.07 : i * 0.05,
              },
              opacity:
                sweeping && !reduced
                  ? {
                      duration: 1.1,
                      repeat: Infinity,
                      ease: "easeInOut",
                      delay: i * 0.16,
                    }
                  : { duration: 0.25, delay: dropped ? 0.3 : 0 },
            }}
          />
        )
      })}
    </svg>
  )
}

export function ConnectionGlyph({
  shown,
  size = 16,
}: {
  shown: ConnectionShown
  size?: number
}) {
  const reduced = useReducedMotion() ?? false
  const key = shown.kind
  return (
    <span
      aria-hidden
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {key === "attention" ? (
          <m.span
            key="attention"
            className="absolute inset-0 flex items-center justify-center"
            initial={{ scale: 0.4, opacity: 0 }}
            animate={
              reduced
                ? { scale: 1, opacity: 1 }
                : { scale: 1, opacity: 1, rotate: [0, -12, 10, -6, 0] }
            }
            exit={{ scale: 0.4, opacity: 0 }}
            transition={{
              scale: springs.bouncy,
              opacity: { duration: 0.15 },
              rotate: { duration: 0.6, delay: 0.15 },
            }}
          >
            <TriangleAlert
              size={size - 1}
              strokeWidth={2.5}
              color="var(--notch-amber)"
              fill="color-mix(in srgb, var(--notch-amber) 18%, transparent)"
            />
          </m.span>
        ) : (
          <m.span
            key="signal"
            className="absolute inset-0"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={springs.smooth}
          >
            <Bars
              quality={shown.kind === "bars" ? shown.quality : 0}
              sweeping={shown.kind === "bars" && shown.sweeping}
              dropped={shown.kind === "offline"}
            />
            <AnimatePresence>
              {shown.kind === "offline" ? (
                <m.span
                  key="plane"
                  className="absolute inset-0 flex items-center justify-center"
                  // after the bars have dropped, the airplane swoops in from the left
                  initial={
                    reduced
                      ? { opacity: 0 }
                      : { opacity: 0, x: -16, y: 7, rotate: -35, scale: 0.6 }
                  }
                  // lucide's plane sits a hair right of its box: nudge it back to center
                  animate={{ opacity: 1, x: -1, y: -1, rotate: 0, scale: 1 }}
                  exit={
                    reduced
                      ? { opacity: 0 }
                      : { opacity: 0, x: 16, y: -7, rotate: 20, scale: 0.6 }
                  }
                  transition={{
                    ...springs.bouncy,
                    delay: reduced ? 0 : 0.35,
                  }}
                >
                  <Plane
                    size={size - 4}
                    strokeWidth={2.25}
                    color="var(--notch-fg)"
                    fill="var(--notch-fg)"
                  />
                </m.span>
              ) : null}
            </AnimatePresence>
          </m.span>
        )}
      </AnimatePresence>
    </span>
  )
}
