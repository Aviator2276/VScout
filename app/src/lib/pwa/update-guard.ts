// What makes applying an update unsafe right now (pwa-offline §7.2): a dirty scouting form or a
// critical in-flight operation holds a blocker (hooks/use-update-blocker.ts). The counter is the
// single source of truth. Cross-tab locking (the shared `vscout-update-guard` Web Lock) is deferred.
export interface UpdateGuard {
  /** returns the release */
  block: () => () => void
  blocked: () => boolean
  subscribe: (listener: () => void) => () => void
}

export function createUpdateGuard(): UpdateGuard {
  let count = 0
  const listeners = new Set<() => void>()
  const emit = () => {
    for (const l of listeners) l()
  }
  return {
    block() {
      count++
      emit()
      let released = false
      return () => {
        if (released) return
        released = true
        count--
        emit()
      }
    },
    blocked: () => count > 0,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export const updateGuard = createUpdateGuard()

/** Never under /scouting (ADR-051/052). */
export function isScoutingPath(pathname: string): boolean {
  return pathname === "/scouting" || pathname.startsWith("/scouting/")
}
