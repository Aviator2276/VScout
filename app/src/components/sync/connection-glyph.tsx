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
const LIT = "rgb(255 255 255)"
const DIM = "rgb(255 255 255 / 0.28)"
const AMBER = "#FFB340"

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
            animate={{
              height: h,
              y: BASE - h,
              // sweeping bars are white and pulse; dropped stubs fade away under the airplane
              fill: lit || sweeping ? LIT : DIM,
              opacity:
                sweeping && !reduced
                  ? [0.25, 0.9, 0.25]
                  : sweeping
                    ? 0.5
                    : dropped
                      ? 0
                      : 1,
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
              fill: { duration: 0.25, delay: i * 0.06 },
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
              color={AMBER}
              fill="rgb(255 179 64 / 0.18)"
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
                  animate={{ opacity: 1, x: 0, y: -1, rotate: 0, scale: 1 }}
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
                    color="rgb(255 255 255 / 0.9)"
                    fill="rgb(255 255 255 / 0.9)"
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
