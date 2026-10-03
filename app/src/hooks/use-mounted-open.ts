// A drawer that mounts already open (lazy-loaded, or opened by a deep link) has no closed state to
// animate from, so it appeared without sliding in. Opening one frame after mount fixes that.
import { useEffect, useState } from "react"

export function useMountedOpen(open: boolean): boolean {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(frame)
  }, [])
  return open && mounted
}
