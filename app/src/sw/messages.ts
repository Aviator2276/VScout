// Messages the page sends to the service worker (pwa-offline.md §6–§7).
export type SwMessage = { type: "SKIP_WAITING" } | { type: "GET_VERSION" }

export function isSwMessage(value: unknown): value is SwMessage {
  if (typeof value !== "object" || value === null || !("type" in value))
    return false
  return value.type === "SKIP_WAITING" || value.type === "GET_VERSION"
}
