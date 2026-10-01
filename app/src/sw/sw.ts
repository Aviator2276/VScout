/// <reference lib="webworker" />
// Service worker (ADR-050/051, pwa-offline.md). Phase 0: precache + SPA navigation + update
// messages. Runtime routes, the offline fallback page and push arrive in later phases.
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching"
import { NavigationRoute, registerRoute } from "workbox-routing"
import { APP_VERSION } from "../config/version"
import { isSwMessage } from "./messages"

declare const self: ServiceWorkerGlobalScope

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// Every navigation gets the prerendered shell; the router renders the route on the client.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("/index.html"), {
    denylist: [/^\/assets\//, /^\/sw\.js$/, /^\/version\.json$/],
  })
)

// No automatic skipWaiting: the page decides when it's safe (ADR-051).
self.addEventListener("message", (event) => {
  const data: unknown = event.data
  if (!isSwMessage(data)) return
  if (data.type === "SKIP_WAITING") void self.skipWaiting()
  if (data.type === "GET_VERSION")
    event.ports[0]?.postMessage({ type: "VERSION", version: APP_VERSION })
})
