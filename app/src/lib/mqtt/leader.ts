// One MQTT connection per device (mqtt.md §3.4): the tab holding the `vscout:mqtt` Web Lock
// connects. A visible tab steals the lock, because a hidden iOS leader is frozen.

export interface LockManagerLike {
  request: (
    name: string,
    options: { steal?: boolean; mode?: "exclusive" },
    callback: () => Promise<void>
  ) => Promise<unknown>
}

export interface Leadership {
  release: () => void
}

/**
 * Asks for the lock. `onGained` runs when this tab becomes leader; `onLost` when another tab steals
 * it. Without Web Locks every tab leads (clientId suffix per tab, mqtt.md §3.4 fallback).
 */
export function requestLeadership(
  locks: LockManagerLike | undefined,
  opts: { name?: string; steal: boolean },
  onGained: () => void,
  onLost: () => void
): Leadership {
  if (!locks) {
    onGained()
    return { release: () => undefined }
  }
  let release: () => void = () => undefined
  const held = new Promise<void>((resolve) => (release = resolve))
  locks
    .request(
      opts.name ?? "vscout:mqtt",
      { steal: opts.steal, mode: "exclusive" },
      async () => {
        onGained()
        await held
      }
    )
    .catch((error: unknown) => {
      // a stolen lock rejects the holder's request with AbortError
      if (error instanceof Error && error.name === "AbortError") onLost()
    })
  return { release: () => release() }
}
