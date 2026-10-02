// Messages the page sends to the service worker (pwa-offline.md §6–§7, push-notifications §6.2).
export type SwMessage =
  | { type: "SKIP_WAITING" }
  | { type: "GET_VERSION" }
  | { type: "SESSION"; uid: string | null }

export function isSwMessage(value: unknown): value is SwMessage {
  if (typeof value !== "object" || value === null || !("type" in value))
    return false
  if (value.type === "SESSION")
    return (
      "uid" in value && (value.uid === null || typeof value.uid === "string")
    )
  return value.type === "SKIP_WAITING" || value.type === "GET_VERSION"
}

/** Messages the service worker sends to windows. */
export type PageMessage =
  | { type: "push-received"; data: unknown }
  | { type: "notification-click"; url: string; data: unknown }
