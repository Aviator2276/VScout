// One link of the Sync Status notch (features/sync-status.md S1): an arrow and a column of bits. While
// data moves the arrow pulses in its direction and the bits stream past at a speed set by the
// throughput; idle, everything is still and dim; off, the bits fall away and the arrow goes gray.
import { AnimatePresence, m, useReducedMotion } from "motion/react"
import { useId } from "react"
import { springs } from "@/components/motion/springs"

export type TransmitMode = "off" | "idle" | "active"

/** A "1": the original icon's shape, 4 wide and 6 tall. */
function One({ y }: { y: number }) {
  return <path d={`M17 ${y + 6}V${y}h-2M15 ${y + 6}h4`} />
}
/** A "0": a rounded box. */
function Zero({ y }: { y: number }) {
  return <rect x="15" y={y} width="4" height="6" ry="2" />
}

const PATTERN = [1, 0, 1, 1] as const
const PITCH = 10
const PERIOD = PATTERN.length * PITCH

function Bits() {
  // two periods, so translating by one period loops seamlessly
  return (
    <>
      {[...PATTERN, ...PATTERN, ...PATTERN].map((b, i) => {
        const y = i * PITCH - PERIOD + 4
        return b === 1 ? <One key={i} y={y} /> : <Zero key={i} y={y} />
      })}
    </>
  )
}

export function TransmitGlyph({
  direction,
  mode,
  loopSeconds,
  waiting = false,
  color,
  size = 16,
}: {
  direction: "down" | "up"
  mode: TransmitMode
  /** seconds per four bits (bitLoopSeconds) */
  loopSeconds: number
  /** changes queued that can't go yet: a small dot under the arrow */
  waiting?: boolean
  /** the link's color (CSS), used when not off */
  color: string
  size?: number
}) {
  const reduced = useReducedMotion() ?? false
  // unique per instance: two pages can be mounted during a transition
  const clipId = `bits-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`
  const down = direction === "down"
  const streaming = mode === "active" && !reduced
  const stroke = mode === "off" ? "rgb(255 255 255 / 0.35)" : color
  // bits travel with the arrow: down for the downlink, up for the uplink
  const from = down ? 0 : PERIOD
  const to = down ? PERIOD : 0
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={stroke}
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="overflow-visible transition-[stroke] duration-300"
    >
      <defs>
        <clipPath id={clipId}>
          <rect x="13" y="3" width="8" height="18" />
        </clipPath>
      </defs>
      <m.g
        animate={streaming ? { y: down ? [0, 2, 0] : [0, -2, 0] } : { y: 0 }}
        transition={
          streaming
            ? {
                duration: Math.max(0.4, loopSeconds * 0.9),
                repeat: Infinity,
                ease: "easeInOut",
              }
            : springs.snappy
        }
        style={{ opacity: mode === "idle" ? 0.7 : 1 }}
      >
        {down ? (
          <>
            <path d="m3 16 4 4 4-4" />
            <path d="M7 20V4" />
          </>
        ) : (
          <>
            <path d="m3 8 4-4 4 4" />
            <path d="M7 4v16" />
          </>
        )}
      </m.g>
      <AnimatePresence initial={false}>
        {mode === "off" ? null : (
          <m.g
            key="bits"
            clipPath={`url(#${clipId})`}
            initial={{ opacity: 0 }}
            animate={{ opacity: mode === "active" ? 1 : 0.45 }}
            // off: the bits fall away
            exit={{ opacity: 0, y: 8 }}
            transition={springs.smooth}
          >
            <m.g
              animate={streaming ? { y: [from, to] } : { y: 0 }}
              transition={
                streaming
                  ? { duration: loopSeconds, repeat: Infinity, ease: "linear" }
                  : springs.snappy
              }
              strokeWidth={2}
            >
              <Bits />
            </m.g>
          </m.g>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {waiting ? (
          <m.circle
            key="waiting"
            cx="18"
            cy="23"
            r="1.6"
            fill={stroke}
            stroke="none"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={springs.bouncy}
          />
        ) : null}
      </AnimatePresence>
    </svg>
  )
}
