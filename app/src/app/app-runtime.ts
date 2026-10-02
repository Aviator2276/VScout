// The browser's one AppRuntime, built on first use (never during the Node prerender).
import { activeGame } from "@/config/game"
import { getEnv } from "@/config/env"
import { APP_VERSION } from "@/config/version"
import type { BroadcastLike } from "@/lib/auth/refresh"
import { getDb } from "@/lib/db/db"
import { mqttJsTransportFactory } from "@/lib/mqtt/transport"
import { createAppRuntime, describeDevice } from "./runtime"
import type { AppRuntime, RuntimeOptions } from "./runtime"

let instance: AppRuntime | null = null

export function getAppRuntime(): AppRuntime {
  if (instance) return instance
  const env = getEnv()
  const locks =
    "locks" in navigator
      ? (navigator.locks as unknown as RuntimeOptions["locks"])
      : undefined
  const authChannel =
    typeof BroadcastChannel === "undefined"
      ? undefined
      : (new BroadcastChannel("vscout:auth") as BroadcastLike)
  instance = createAppRuntime({
    db: getDb(),
    apiUrl: env.apiUrl,
    mqttUrl: env.mqttUrl,
    appVersion: APP_VERSION,
    games: (id) => (id === activeGame.id ? activeGame : null),
    mqttTransport: mqttJsTransportFactory(),
    window,
    document,
    isOnline: () => navigator.onLine,
    ...(locks ? { locks } : {}),
    ...(authChannel ? { authChannel } : {}),
    deviceName: () => describeDevice(navigator.userAgent),
    ...("serviceWorker" in navigator
      ? {
          push: {
            registration: () =>
              navigator.serviceWorker.getRegistration().then((r) => r ?? null),
            permission: () =>
              typeof Notification === "undefined"
                ? null
                : Notification.permission,
            requestPermission: () => Notification.requestPermission(),
            ua: navigator.userAgent,
            platform: navigator.platform,
            maxTouchPoints: navigator.maxTouchPoints,
            standalone: () =>
              matchMedia("(display-mode: standalone)").matches ||
              (navigator as { standalone?: boolean }).standalone === true,
          },
        }
      : {}),
    ...("storage" in navigator && "persist" in navigator.storage
      ? { persistStorage: () => navigator.storage.persist() }
      : {}),
  })
  return instance
}
