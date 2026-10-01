// One sync run per device (data-layer §7.3): the run body holds `vscout:sync` with ifAvailable.
// Without Web Locks, runs aren't coordinated across tabs; idempotency keeps that correct.
export interface SyncLockManager {
  request: <TResult>(
    name: string,
    options: { ifAvailable: true },
    callback: (lock: object | null) => Promise<TResult>
  ) => Promise<TResult>
}

/** Runs fn if this tab gets the lock; returns "busy" when another tab is running. */
export async function withSyncLock<TResult>(
  locks: SyncLockManager | undefined,
  fn: () => Promise<TResult>
): Promise<TResult | "busy"> {
  if (!locks) return fn()
  return locks.request("vscout:sync", { ifAvailable: true }, async (lock) =>
    lock ? fn() : "busy"
  )
}
