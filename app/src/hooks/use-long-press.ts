// Long-press with pointer events (features/glossary-help.md §3): fires after `ms`, cancelled by
// moving more than 8 px, lifting or a pointercancel. `pressing` drives the fill-in highlight.
import { useCallback, useEffect, useRef, useState } from "react"
import type { PointerEvent } from "react"

const SLOP = 8

export function useLongPress(onLongPress: () => void, ms = 500) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const [pressing, setPressing] = useState(false)

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    start.current = null
    setPressing(false)
  }, [])
  useEffect(() => cancel, [cancel])

  return {
    pressing,
    handlers: {
      onPointerDown: (e: PointerEvent) => {
        if (e.button !== 0) return
        start.current = { x: e.clientX, y: e.clientY }
        setPressing(true)
        timer.current = setTimeout(() => {
          cancel()
          onLongPress()
        }, ms)
      },
      onPointerMove: (e: PointerEvent) => {
        const s = start.current
        if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > SLOP) cancel()
      },
      onPointerUp: cancel,
      onPointerCancel: cancel,
      onPointerLeave: cancel,
    },
  }
}
