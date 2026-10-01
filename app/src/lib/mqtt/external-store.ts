// A tiny external store for useSyncExternalStore. Snapshots change identity only on change.
export interface ExternalStore<TValue> {
  getSnapshot: () => TValue
  subscribe: (listener: () => void) => () => void
}

export interface WritableStore<TValue> extends ExternalStore<TValue> {
  set: (next: TValue) => void
  update: (fn: (current: TValue) => TValue) => void
}

export function createStore<TValue>(initial: TValue): WritableStore<TValue> {
  let value = initial
  const listeners = new Set<() => void>()
  const set = (next: TValue) => {
    if (Object.is(next, value)) return
    value = next
    for (const l of listeners) l()
  }
  return {
    getSnapshot: () => value,
    subscribe: (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    set,
    update: (fn) => set(fn(value)),
  }
}
