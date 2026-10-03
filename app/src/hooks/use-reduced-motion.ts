// The system Reduce Motion setting, live. Server/test environments without matchMedia read false.
import { useSyncExternalStore } from "react"

const QUERY = "(prefers-reduced-motion: reduce)"

function subscribe(onChange: () => void) {
  if (typeof matchMedia !== "function") return () => undefined
  const mq = matchMedia(QUERY)
  mq.addEventListener("change", onChange)
  return () => mq.removeEventListener("change", onChange)
}

const read = () => typeof matchMedia === "function" && matchMedia(QUERY).matches

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, read, () => false)
}
