// iOS swipe actions for list rows (owner: notifications, teams, matches…). Swipe a row sideways to
// reveal its actions; swipe all the way to run the edge one (Mail's full swipe). A vertical drag
// stays a scroll (direction lock), and the row opts out of the tab-switching swipe
// (`data-no-swipe`). Tapping an open row closes it instead of following its link. Actions are a
// shortcut: every one also exists elsewhere (the row's ⋯ menu or its page) for keyboard and
// VoiceOver users, so the revealed buttons stay out of the a11y tree while closed.
import { animate, m, useMotionValue, useTransform } from "motion/react"
import { useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import type { LucideIcon } from "@/components/icons/icon"
import { springs } from "@/components/motion/springs"
import { haptic } from "@/lib/haptics"
import { cn } from "@/lib/utils"

export interface SwipeAction {
  label: string
  icon: LucideIcon
  tone: "primary" | "destructive" | "warning" | "neutral"
  onAction: () => void
}

const TONE: Record<SwipeAction["tone"], string> = {
  primary: "bg-primary text-primary-foreground",
  destructive: "bg-destructive text-white",
  warning: "bg-tile-orange text-white",
  neutral: "bg-tile-gray text-white",
}

const BUTTON_PX = 76
const OPEN_PX = 40
/** past this share of the row's width a release runs the edge action */
const FULL = 0.55

export function SwipeRow({
  leading = [],
  trailing = [],
  className,
  children,
}: {
  /** revealed by swiping right; the first one runs on a full swipe */
  leading?: ReadonlyArray<SwipeAction>
  /** revealed by swiping left; the first one runs on a full swipe */
  trailing?: ReadonlyArray<SwipeAction>
  className?: string
  children: ReactNode
}) {
  const root = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  const [open, setOpen] = useState<"leading" | "trailing" | null>(null)
  const armed = useRef(false)
  const leadingOpacity = useTransform(x, [0, 8], [0, 1])
  const trailingOpacity = useTransform(x, [-8, 0], [1, 0])
  const [rowWidth, setRowWidth] = useState(360)
  useEffect(() => {
    const el = root.current
    if (!el || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => setRowWidth(el.offsetWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  if (leading.length === 0 && trailing.length === 0)
    return <div className={className}>{children}</div>

  const width = () => rowWidth
  const settle = (to: number) => animate(x, to, springs.snappy)
  const close = () => {
    setOpen(null)
    void settle(0)
  }
  const run = (action: SwipeAction, side: 1 | -1) => {
    haptic("success")
    void animate(x, side * width(), springs.snappy).then(() => {
      action.onAction()
      x.set(0)
      setOpen(null)
    })
  }

  return (
    <div
      ref={root}
      data-no-swipe=""
      className={cn("relative overflow-hidden", className)}
    >
      {leading.length > 0 ? (
        <m.div
          aria-hidden={open !== "leading"}
          style={{ opacity: leadingOpacity }}
          className={cn(
            "absolute inset-y-0 left-0 flex w-full",
            TONE[leading[0]?.tone ?? "primary"]
          )}
        >
          {leading.map((a) => (
            <SwipeButton
              key={a.label}
              action={a}
              tabIndex={open === "leading" ? 0 : -1}
              onPress={() => {
                close()
                a.onAction()
              }}
            />
          ))}
        </m.div>
      ) : null}
      {trailing.length > 0 ? (
        <m.div
          aria-hidden={open !== "trailing"}
          style={{ opacity: trailingOpacity }}
          className={cn(
            "absolute inset-y-0 right-0 flex w-full flex-row-reverse",
            TONE[trailing[0]?.tone ?? "destructive"]
          )}
        >
          {trailing.map((a) => (
            <SwipeButton
              key={a.label}
              action={a}
              tabIndex={open === "trailing" ? 0 : -1}
              onPress={() => {
                close()
                a.onAction()
              }}
            />
          ))}
        </m.div>
      ) : null}
      <m.div
        style={{ x }}
        drag="x"
        dragDirectionLock
        dragConstraints={{
          left: trailing.length ? -rowWidth : 0,
          right: leading.length ? rowWidth : 0,
        }}
        dragElastic={0.08}
        dragMomentum={false}
        onDrag={() => {
          const past = Math.abs(x.get()) > width() * FULL
          if (past !== armed.current) {
            armed.current = past
            if (past) haptic("selection")
          }
        }}
        onDragEnd={() => {
          const dx = x.get()
          armed.current = false
          const w = width()
          const lead = leading[0]
          const trail = trailing[0]
          if (dx > w * FULL && lead) run(lead, 1)
          else if (dx < -w * FULL && trail) run(trail, -1)
          else if (dx > OPEN_PX && leading.length) {
            setOpen("leading")
            void settle(leading.length * BUTTON_PX)
          } else if (dx < -OPEN_PX && trailing.length) {
            setOpen("trailing")
            void settle(-trailing.length * BUTTON_PX)
          } else close()
        }}
        // an open row closes on tap instead of following its link
        onClickCapture={(e) => {
          if (open) {
            e.preventDefault()
            e.stopPropagation()
            close()
          }
        }}
        className="relative touch-pan-y bg-background"
      >
        {children}
      </m.div>
    </div>
  )
}

function SwipeButton({
  action,
  tabIndex,
  onPress,
}: {
  action: SwipeAction
  tabIndex: number
  onPress: () => void
}) {
  const Icon = action.icon
  return (
    <button
      type="button"
      tabIndex={tabIndex}
      onClick={onPress}
      className={cn(
        "flex h-full w-[76px] shrink-0 flex-col items-center justify-center gap-1 text-caption-1 font-semibold",
        TONE[action.tone]
      )}
    >
      <Icon aria-hidden size={20} />
      {action.label}
    </button>
  )
}
