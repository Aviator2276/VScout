// Token refresh (routing-auth §7.3): single flight per tab, one tab at a time across tabs (Web Lock
// `vscout:refresh`), and the new token is shared on BroadcastChannel `vscout:auth`. Two tabs rotating
// the refresh cookie at once would trip reuse detection and log the user out.
import { decodeSession } from "@/lib/api/adapters/session-adapter"
import type { DecodedSession } from "@/lib/api/adapters/session-adapter"
import type { ApiClient } from "@/lib/api/api-client"
import { ApiError, OfflineError } from "@/lib/api/errors"
import type { TokenStore } from "./token-store"

export type RefreshOutcome =
  | { kind: "ok"; session: DecodedSession | null }
  | { kind: "offline" }
  | { kind: "rejected" }
  | { kind: "disabled" }

export interface RefreshLockManager {
  request: <TResult>(
    name: string,
    callback: () => Promise<TResult>
  ) => Promise<TResult>
}

export interface BroadcastLike {
  postMessage: (message: unknown) => void
  addEventListener: (
    type: "message",
    listener: (e: { data: unknown }) => void
  ) => void
  removeEventListener: (
    type: "message",
    listener: (e: { data: unknown }) => void
  ) => void
}

export interface RefresherDeps {
  api: ApiClient
  tokens: TokenStore
  now: () => number
  locks?: RefreshLockManager
  channel?: BroadcastLike
}

/** A token another tab shared is good enough if it has more than this left. */
const FRESH_MS = 60_000

interface TokenMessage {
  type: "token"
  token: string
  expiresAt: number
}

function isTokenMessage(data: unknown): data is TokenMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { type?: unknown }).type === "token"
  )
}

export function createRefresher(deps: RefresherDeps) {
  let inFlight: Promise<RefreshOutcome> | null = null

  deps.channel?.addEventListener("message", (e) => {
    if (isTokenMessage(e.data) && e.data.expiresAt > deps.tokens.expiresAt())
      deps.tokens.set(e.data.token, e.data.expiresAt)
  })

  const call = async (): Promise<RefreshOutcome> => {
    const before = deps.tokens.get()
    const run = async (): Promise<RefreshOutcome> => {
      // another tab may have refreshed while we waited for the lock
      const shared = deps.tokens.get()
      if (
        shared &&
        shared !== before &&
        deps.tokens.expiresAt() - deps.now() > FRESH_MS
      )
        return { kind: "ok", session: null }
      try {
        const res = await deps.api.request({
          method: "POST",
          path: "/auth/refresh",
          class: "auth",
          anonymous: true,
        })
        const decoded = decodeSession(res.body)
        if (!decoded.ok) return { kind: "offline" } // a malformed answer: try again later
        deps.tokens.set(
          decoded.value.accessToken,
          decoded.value.accessExpiresAt
        )
        deps.channel?.postMessage({
          type: "token",
          token: decoded.value.accessToken,
          expiresAt: decoded.value.accessExpiresAt,
        } satisfies TokenMessage)
        return { kind: "ok", session: decoded.value }
      } catch (error) {
        if (error instanceof OfflineError) return { kind: "offline" }
        if (error instanceof ApiError && error.status === 403)
          return { kind: "disabled" }
        if (error instanceof ApiError && error.status === 401)
          return { kind: "rejected" }
        if (error instanceof ApiError) return { kind: "offline" } // 5xx etc.: keep the session, retry later
        throw error
      }
    }
    return deps.locks ? deps.locks.request("vscout:refresh", run) : run()
  }

  return {
    refresh(): Promise<RefreshOutcome> {
      inFlight ??= call().finally(() => {
        inFlight = null
      })
      return inFlight
    },
  }
}
