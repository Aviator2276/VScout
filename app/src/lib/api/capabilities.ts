// The backend's optional features (/meta capabilities, ADR-071), as a tiny external store that
// React reads with useSyncExternalStore. Refreshed at boot and on every sys/status change.
import { NO_CAPABILITIES } from "./adapters/meta-adapter"
import type { Capabilities } from "./adapters/meta-adapter"

export interface CapabilitiesStore {
  get: () => Capabilities
  set: (next: Capabilities) => void
  subscribe: (listener: () => void) => () => void
}

export function createCapabilitiesStore(
  initial: Capabilities = NO_CAPABILITIES
): CapabilitiesStore {
  let current = initial
  const listeners = new Set<() => void>()
  return {
    get: () => current,
    set: (next) => {
      const changed = (Object.keys(next) as Array<keyof Capabilities>).some(
        (k) => next[k] !== current[k]
      )
      if (!changed) return
      current = next
      for (const l of listeners) l()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
