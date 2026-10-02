// App updates (pwa-offline §6–§8, ADR-069): detect a new version, download it in the background,
// and apply it only at a safe moment. The service worker is behind `UpdatePort`, so this runs in
// tests without a browser; sw-client.ts adapts workbox-window to it.
import { logger } from "@/lib/logger"
import { createStore } from "@/lib/mqtt/external-store"
import type { ExternalStore } from "@/lib/mqtt/external-store"
import { compareSemver, isBelowMinimum, parseSemver } from "@/utils/semver"
import { isScoutingPath } from "./update-guard"
import type { UpdateGuard } from "./update-guard"

export type UpdateStatus =
  | "unsupported"
  | "idle"
  | "checking"
  | "downloading"
  | "ready"
  | "applying"
  | "error"

export interface UpdateState {
  status: UpdateStatus
  current: string
  available?: string
  /** minClientVersion > current (§8) */
  forced: boolean
  minClientVersion?: string
  lastCheckedAt?: number
  /** when status became ready (the banner waits 2 min on one screen) */
  readyAt?: number
  /** a SW controls this page and its precache is complete */
  offlineReady: boolean
  /** another tab applied an update while this one was busy (§7.4) */
  updatedElsewhere: boolean
}

export type CheckReason =
  "launch" | "visible" | "interval" | "online" | "server" | "426" | "manual"

export type CheckResult = "offline" | "failed" | "up-to-date" | "available"

export interface UpdatePortHandlers {
  onInstalling: () => void
  onWaiting: (wasWaitingBeforeRegister: boolean) => void
  /** a new SW took control of this page */
  onControlling: () => void
  onActivated: (isUpdate: boolean) => void
}

export interface UpdatePort {
  register: (handlers: UpdatePortHandlers) => Promise<void>
  /** re-fetch sw.js, bypassing the HTTP cache */
  update: () => Promise<void>
  hasWaiting: () => boolean
  waitingVersion: () => Promise<string | null>
  skipWaiting: () => void
  /** a service worker controls this page (it was installed on an earlier visit) */
  isControlled: () => boolean
}

export interface UpdateDeps {
  port: UpdatePort
  current: string
  guard: UpdateGuard
  fetchRemoteVersion: () => Promise<string | null>
  isOnline: () => boolean
  isVisible: () => boolean
  pathname: () => string
  reload: (href?: string) => void
  now: () => number
  /** sessionStorage: the apply loop guard and the "updated from" marker */
  session?: Pick<Storage, "getItem" | "setItem" | "removeItem">
  applyTimeoutMs?: number
}

const THROTTLE_MS = 60_000
const COLD_START_MS = 5_000
const APPLY_LOOP_MS = 60_000
export const UPDATED_FROM_KEY = "vscout.updatedFrom"
const LAST_APPLY_KEY = "vscout.lastApplyAt"
const THROTTLED: ReadonlySet<CheckReason> = new Set([
  "visible",
  "online",
  "426",
])

export function createUpdateController(d: UpdateDeps) {
  const startedAt = d.now()
  const state = createStore<UpdateState>({
    status: "idle",
    current: d.current,
    forced: false,
    offlineReady: false,
    updatedElsewhere: false,
  })
  const patch = (p: Partial<UpdateState>) =>
    state.update((s) => ({ ...s, ...p }))
  let lastAutoCheck = 0
  let applyTimer: ReturnType<typeof setTimeout> | null = null
  let pendingHref: string | undefined

  const session = {
    get: (k: string) => {
      try {
        return d.session?.getItem(k) ?? null
      } catch {
        return null
      }
    },
    set: (k: string, v: string) => {
      try {
        d.session?.setItem(k, v)
      } catch {
        // private mode: the loop guard is best effort
      }
    },
  }

  /** §7.2 conditions 1, 2, 4 and 5 for this tab */
  function isSafeToApply(targetPath?: string): boolean {
    if (d.guard.blocked()) return false
    if (isScoutingPath(d.pathname())) return false
    if (targetPath !== undefined && isScoutingPath(targetPath)) return false
    return true
  }

  async function markReady() {
    const version = await d.port.waitingVersion().catch(() => null)
    const s = state.getSnapshot()
    patch({
      status: "ready",
      available: version ?? s.available,
      readyAt: s.status === "ready" ? s.readyAt : d.now(),
    })
  }

  async function check(reason: CheckReason): Promise<CheckResult> {
    if (state.getSnapshot().status === "unsupported") return "failed"
    if (THROTTLED.has(reason)) {
      if (d.now() - lastAutoCheck < THROTTLE_MS) return "up-to-date"
      lastAutoCheck = d.now()
    }
    if (!d.isOnline()) return "offline"
    const before = state.getSnapshot().status
    if (before === "idle" || before === "error") patch({ status: "checking" })
    let remote: string | null
    try {
      remote = await d.fetchRemoteVersion()
      await d.port.update()
    } catch (error) {
      logger.info("pwa", "update check failed", {
        reason,
        error: String(error),
      })
      if (state.getSnapshot().status === "checking") patch({ status: "idle" })
      return "failed"
    }
    patch({ lastCheckedAt: d.now() })
    const newer =
      remote !== null &&
      parseSemver(remote) !== null &&
      compareSemver(remote, d.current) > 0
        ? remote
        : null
    if (d.port.hasWaiting()) {
      await markReady()
      return "available"
    }
    if (newer) {
      patch({
        available: newer,
        status:
          state.getSnapshot().status === "checking"
            ? "downloading"
            : state.getSnapshot().status,
      })
      return "available"
    }
    if (state.getSnapshot().status === "checking") patch({ status: "idle" })
    return "up-to-date"
  }

  /** SKIP_WAITING, then reload on `controlling` (§7.4). Refuses twice within 60 s. */
  function apply(opts: { href?: string } = {}): boolean {
    const s = state.getSnapshot()
    if (s.status !== "ready") return false
    const last = Number(session.get(LAST_APPLY_KEY) ?? 0)
    if (d.now() - last < APPLY_LOOP_MS) {
      patch({ status: "error" })
      logger.warn("pwa", "update apply loop refused")
      return false
    }
    session.set(LAST_APPLY_KEY, String(d.now()))
    session.set(UPDATED_FROM_KEY, d.current)
    pendingHref = opts.href
    patch({ status: "applying" })
    d.port.skipWaiting()
    applyTimer = setTimeout(() => {
      applyTimer = null
      logger.warn("pwa", "update-apply-timeout")
      patch({ status: "ready" })
    }, d.applyTimeoutMs ?? 5_000)
    return true
  }

  async function start(): Promise<void> {
    await d.port.register({
      onInstalling: () => {
        if (state.getSnapshot().status !== "ready")
          patch({ status: "downloading" })
      },
      onWaiting: (wasWaitingBeforeRegister) => {
        void markReady().then(() => {
          // cold start: apply behind the launch (§7.3), most iOS updates happen here
          if (
            wasWaitingBeforeRegister &&
            d.now() - startedAt < COLD_START_MS &&
            isSafeToApply()
          )
            apply()
        })
      },
      onControlling: () => {
        if (applyTimer) clearTimeout(applyTimer)
        applyTimer = null
        if (state.getSnapshot().status === "applying") {
          d.reload(pendingHref)
          return
        }
        // another tab applied it
        if (isSafeToApply()) d.reload()
        else patch({ updatedElsewhere: true })
      },
      onActivated: (isUpdate) => {
        if (!isUpdate) patch({ offlineReady: true })
      },
    })
    if (d.port.isControlled()) patch({ offlineReady: true })
    void check("launch")
  }

  return {
    state: state as ExternalStore<UpdateState>,
    start,
    check,
    apply,
    isSafeToApply,
    /** a navigation is about to happen: the update can ride along (§7.3) */
    onBeforeNavigate(to: { pathname: string; href: string }): boolean {
      if (state.getSnapshot().status !== "ready") return false
      if (!isSafeToApply(to.pathname)) return false
      return apply({ href: to.href })
    },
    /** the page was hidden: apply quietly if it's safe (§7.3) */
    onHidden(): void {
      if (state.getSnapshot().status === "ready" && isSafeToApply()) apply()
    },
    /** from /meta, sys/status or a 426 (§8) */
    setMinClientVersion(min: string): void {
      if (!parseSemver(min)) return
      const prev = state.getSnapshot().minClientVersion
      if (prev && compareSemver(prev, min) >= 0) return
      patch({ minClientVersion: min, forced: isBelowMinimum(d.current, min) })
      if (isBelowMinimum(d.current, min)) void check("426")
    },
    markUnsupported(): void {
      patch({ status: "unsupported" })
    },
    /** "Updated to VScout X" once after an applied update (§7.4) */
    takeUpdatedFrom(): string | null {
      const from = session.get(UPDATED_FROM_KEY)
      try {
        d.session?.removeItem(UPDATED_FROM_KEY)
      } catch {
        // ignore
      }
      return from && from !== d.current ? from : null
    },
  }
}

export type UpdateController = ReturnType<typeof createUpdateController>
