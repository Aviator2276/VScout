// Count stepper: our own, not Konsta's (its buttons are unnamed spans, ui-design-system §2). 56 pt
// targets for gloves, long-press repeats, the value is announced. No scale bounce on repeated taps
// (HIG): an instant color change plus a haptic.
import { useEffect, useRef } from "react"
import { haptic } from "@/lib/haptics"

export interface CountStepperProps {
  /** what is counted, used in the button names: "Increase fouls" */
  label: string
  value: number
  onValueChange: (value: number) => void
  min?: number
  max?: number
  step?: number
}

const REPEAT_DELAY_MS = 400
const REPEAT_EVERY_MS = 90

const BUTTON =
  "flex size-14 touch-manipulation select-none items-center justify-center rounded-xl bg-secondary font-heading text-title-2 text-secondary-foreground active:bg-primary active:text-primary-foreground disabled:opacity-40"

/** One −/+ button. `step` returns false at a limit, which ends a press-and-hold repeat. */
function StepButton({
  name,
  symbol,
  disabled,
  step,
}: {
  name: string
  symbol: string
  disabled: boolean
  step: () => boolean
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stop = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )
  return (
    <button
      type="button"
      aria-label={name}
      disabled={disabled}
      className={BUTTON}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        step()
        const repeat = () => {
          if (step()) timer.current = setTimeout(repeat, REPEAT_EVERY_MS)
        }
        timer.current = setTimeout(repeat, REPEAT_DELAY_MS)
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      // keyboard and assistive tech activate with a click that has no pointer press (detail 0)
      onClick={(e) => {
        if (e.detail === 0) step()
      }}
    >
      {symbol}
    </button>
  )
}

export function CountStepper({
  label,
  value,
  onValueChange,
  min = 0,
  max = 99,
  step = 1,
}: CountStepperProps) {
  // the latest value for press-and-hold, which fires between renders
  const latest = useRef(value)
  useEffect(() => {
    latest.current = value
  }, [value])

  const change = (delta: number): boolean => {
    const next = Math.min(max, Math.max(min, latest.current + delta))
    if (next === latest.current) {
      haptic("warning")
      return false
    }
    latest.current = next
    onValueChange(next)
    haptic("selection")
    return true
  }

  return (
    <div role="group" aria-label={label} className="flex items-center gap-3">
      <StepButton
        name={`Decrease ${label}`}
        symbol="−"
        disabled={value <= min}
        step={() => change(-step)}
      />
      <output
        aria-live="polite"
        className="min-w-12 text-center font-heading text-title-1 tabular-nums"
      >
        {value}
      </output>
      <StepButton
        name={`Increase ${label}`}
        symbol="+"
        disabled={value >= max}
        step={() => change(step)}
      />
    </div>
  )
}
