// Push subscription lifecycle (push-notifications.md §3, push-contract §2). Plain TS: SessionRuntime
// reconciles on boot and when the page shows; logout unbinds before the wipe. Requests go through
// lib/api (ApiTransport, ADR-063); the subscription itself is the browser's.
import type { ApiClient } from "@/lib/api/api-client"
import { getKv, setKv } from "@/lib/db/kv"
import type { VScoutDB } from "@/lib/db/schema"
import { logger } from "@/lib/logger"
import { computeState, isIOS, isInAppBrowser } from "./push-state"
import type { PromptRecord, PushFacts, PushState } from "./push-state"

/** The browser APIs push needs, injectable for tests. */
export interface PushEnv {
  registration: () => Promise<ServiceWorkerRegistration | null>
  permission: () => NotificationPermission | null
  requestPermission: () => Promise<NotificationPermission>
  ua: string
  platform: string
  maxTouchPoints: number
  standalone: () => boolean
}

export interface PushClientDeps {
  api: ApiClient
  db: () => VScoutDB
  deviceId: () => Promise<string>
  now: () => number
  appVersion: string
  env: PushEnv | null
}

const REPUT_MS = 24 * 3_600_000

interface LastPut {
  endpoint: string
  key: string
  at: number
}

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (s.length % 4)) % 4)
  const raw = atob((s + pad).replaceAll("-", "+").replaceAll("_", "/"))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/** iOS < 16.4, Safari tabs and some webviews register a SW without push: no pushManager. */
function pushManagerOf(
  reg: ServiceWorkerRegistration | null | undefined
): PushManager | null {
  return reg &&
    "pushManager" in reg &&
    (reg.pushManager as PushManager | undefined)
    ? reg.pushManager
    : null
}

export function createPushClient(d: PushClientDeps) {
  const listeners = new Set<() => void>()
  let state: PushState = "unsupported"
  const emit = () => {
    for (const l of listeners) l()
  }

  async function facts(): Promise<PushFacts | null> {
    const env = d.env
    if (!env) return null
    const reg = await env.registration().catch(() => null)
    const pm = pushManagerOf(reg)
    const sub = await pm?.getSubscription().catch(() => null)
    return {
      hasServiceWorker: reg !== null,
      hasPushManager: pm !== null,
      hasNotification: env.permission() !== null,
      ios: isIOS(env.ua, env.platform, env.maxTouchPoints),
      standalone: env.standalone(),
      inAppBrowser: isInAppBrowser(env.ua),
      permission: env.permission() ?? "default",
      subscribed: sub !== null && sub !== undefined,
    }
  }

  async function prompt(): Promise<PromptRecord> {
    return (
      (await getKv(d.db(), "pushPrompt")) ?? {
        dismissals: 0,
        lastDismissedAt: null,
      }
    )
  }

  async function refresh(): Promise<PushState> {
    const f = await facts()
    state = f ? computeState(f, await prompt(), d.now()) : "unsupported"
    emit()
    return state
  }

  async function vapidKey(): Promise<string> {
    const res = await d.api.request({
      method: "GET",
      path: "/push/vapid-public-key",
      class: "delta",
      anonymous: true,
    })
    const key = (res.body as { publicKey?: unknown } | null)?.publicKey
    if (typeof key !== "string") throw new Error("No VAPID key")
    return key
  }

  async function put(sub: PushSubscription, key: string): Promise<void> {
    const id = await d.deviceId()
    await d.api.request({
      method: "PUT",
      path: `/push/subscriptions/${id}`,
      class: "write",
      body: {
        subscription: sub.toJSON(),
        platform: {
          os:
            d.env && isIOS(d.env.ua, d.env.platform, d.env.maxTouchPoints)
              ? "ios"
              : /Android/.test(d.env?.ua ?? "")
                ? "android"
                : "other",
          standalone: d.env?.standalone() ?? false,
          declarative: typeof window !== "undefined" && "pushManager" in window,
          appVersion: d.appVersion,
        },
      },
    })
    await setKv(d.db(), "pushLastPut", {
      endpoint: sub.endpoint,
      key,
      at: d.now(),
    } satisfies LastPut)
  }

  /** Subscribe if needed and tell the server; silent (no OS dialog). */
  async function ensure(): Promise<PushState> {
    const env = d.env
    if (!env || env.permission() !== "granted") return refresh()
    try {
      const pm = pushManagerOf(await env.registration())
      if (!pm) return refresh()
      const key = await vapidKey()
      let sub = await pm.getSubscription()
      const last = await getKv(d.db(), "pushLastPut")
      if (sub && last && last.key !== key) {
        // the server rotated its VAPID key: the old subscription can't receive anything
        await sub.unsubscribe()
        sub = null
      }
      sub ??= await pm.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64urlToBytes(key),
      })
      if (
        !last ||
        last.endpoint !== sub.endpoint ||
        last.key !== key ||
        d.now() - last.at > REPUT_MS
      )
        await put(sub, key)
    } catch (error) {
      logger.info("push", "subscription not ready", { error: String(error) })
    }
    return refresh()
  }

  return {
    getState: () => state,
    subscribe(l: () => void) {
      listeners.add(l)
      return () => {
        listeners.delete(l)
      }
    },
    refresh,
    /** boot, visible, and after sign-in */
    reconcile: ensure,
    /**
     * The pre-prompt's Turn On button. Must be called straight from the tap: WebKit drops the user
     * activation after an await, so the permission request is the first thing that happens.
     */
    enable(): Promise<PushState> {
      const asked = d.env?.requestPermission()
      if (!asked) return refresh()
      return asked.then(() => ensure())
    },
    async dismissPrompt(): Promise<void> {
      const p = await prompt()
      await setKv(d.db(), "pushPrompt", {
        dismissals: p.dismissals + 1,
        lastDismissedAt: d.now(),
      })
      await refresh()
    },
    /** turning push off on this device (and the guest's single switch) */
    async disable(): Promise<void> {
      await unbind()
      await refresh()
    },
    /** POST /push/test (push-contract §2.5): how many of my devices it targeted */
    async test(): Promise<number | null> {
      const res = await d.api.request({
        method: "POST",
        path: "/push/test",
        class: "write",
      })
      const targeted = (res.body as { targeted?: unknown } | null)?.targeted
      return typeof targeted === "number" ? targeted : null
    },
  }

  /** Logout (push-notifications.md §3): DELETE best effort, then kill the endpoint locally. */
  async function unbind(): Promise<void> {
    try {
      const id = await d.deviceId()
      await d.api.request({
        method: "DELETE",
        path: `/push/subscriptions/${id}`,
        class: "write",
      })
    } catch (error) {
      logger.info("push", "unsubscribe call failed", { error: String(error) })
    }
    const pm = pushManagerOf(await d.env?.registration().catch(() => null))
    const sub = await pm?.getSubscription().catch(() => null)
    await sub?.unsubscribe().catch(() => undefined)
    await setKv(d.db(), "pushLastPut", null)
  }
}

export type PushClient = ReturnType<typeof createPushClient>
