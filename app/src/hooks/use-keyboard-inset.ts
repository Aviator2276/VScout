// How much of the layout viewport the on-screen keyboard covers (FX-22). iOS Safari doesn't resize
// the page for the keyboard (no `interactive-widget` support), so fixed bottom bars would sit
// under it; they lift themselves by this many pixels instead. 0 when no keyboard is up.
import { useEffect, useState } from "react"

/** smaller gaps are toolbars and rounding, not a keyboard */
const MIN_KEYBOARD_PX = 80

export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0)
  useEffect(() => {
    const vv = typeof window === "undefined" ? undefined : window.visualViewport
    if (!vv) return
    const update = () => {
      const covered = window.innerHeight - vv.height - vv.offsetTop
      setInset(covered >= MIN_KEYBOARD_PX ? Math.round(covered) : 0)
    }
    update()
    vv.addEventListener("resize", update)
    vv.addEventListener("scroll", update)
    return () => {
      vv.removeEventListener("resize", update)
      vv.removeEventListener("scroll", update)
    }
  }, [])
  return inset
}
