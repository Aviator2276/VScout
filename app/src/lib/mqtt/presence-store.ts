// Presence and typing live in memory only, never Dexie (mqtt.md §7).
import type { Presence } from "@/lib/contracts/mqtt"
import { createStore } from "./external-store"
import type { ExternalStore } from "./external-store"

export interface PresenceEntry {
  userId: string
  deviceId: string
  status: Presence["status"]
  at: number
  appVersion?: string
}

const TYPING_TTL_MS = 5_000

export interface PresenceStores {
  presence: ExternalStore<ReadonlyMap<string, PresenceEntry>>
  typing: ExternalStore<ReadonlyMap<string, ReadonlyArray<string>>>
  setPresence: (eventKey: string, p: Presence, receivedAt: number) => void
  setTyping: (
    channelId: string,
    userId: string,
    state: "typing" | "idle",
    at: number
  ) => void
  /** drops typing entries older than 5 s */
  expireTyping: (now: number) => void
  clear: () => void
}

export function createPresenceStores(): PresenceStores {
  const presence = createStore<ReadonlyMap<string, PresenceEntry>>(new Map())
  const typing = createStore<ReadonlyMap<string, ReadonlyArray<string>>>(
    new Map()
  )
  const typingAt = new Map<string, number>() // `${channelId}/${userId}` → at

  const rebuildTyping = () => {
    const byChannel = new Map<string, Array<string>>()
    for (const key of typingAt.keys()) {
      const [channelId = "", userId = ""] = key.split("/")
      byChannel.set(channelId, [...(byChannel.get(channelId) ?? []), userId])
    }
    typing.set(byChannel)
  }

  return {
    presence,
    typing,
    setPresence(_eventKey, p, receivedAt) {
      const key = `${p.userId}/${p.deviceId}`
      presence.update((m) => {
        const next = new Map(m)
        next.set(key, {
          userId: p.userId,
          deviceId: p.deviceId,
          status: p.status,
          at: p.ts ? Date.parse(p.ts) : receivedAt, // the will has no ts
          ...(p.appVersion ? { appVersion: p.appVersion } : {}),
        })
        return next
      })
    },
    setTyping(channelId, userId, state, at) {
      const key = `${channelId}/${userId}`
      if (state === "typing") typingAt.set(key, at)
      else typingAt.delete(key)
      rebuildTyping()
    },
    expireTyping(now) {
      let changed = false
      for (const [key, at] of typingAt)
        if (now - at > TYPING_TTL_MS) {
          typingAt.delete(key)
          changed = true
        }
      if (changed) rebuildTyping()
    },
    clear() {
      presence.set(new Map())
      typingAt.clear()
      typing.set(new Map())
    },
  }
}
