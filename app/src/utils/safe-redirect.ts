// Open-redirect guard for ?redirect= (routing-auth §6): only same-origin paths survive.
export function safeRedirect(raw: unknown, fallback = "/"): string {
  if (typeof raw !== "string") return fallback
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\"))
    return fallback
  try {
    const url = new URL(raw, "https://vscout.invalid")
    if (url.origin !== "https://vscout.invalid") return fallback
    // never bounce back to login (a redirect loop)
    if (url.pathname === "/login") return fallback
    return url.pathname + url.search + url.hash
  } catch {
    return fallback
  }
}
