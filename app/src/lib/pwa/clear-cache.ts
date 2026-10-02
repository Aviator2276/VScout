// Clear Cache and Re-download (features/settings-storage.md, pwa-offline §11.3, ADR-070). The
// order matters: if IndexedDB can't be deleted (another tab holds it), abort before anything else.
import type { VScoutDB } from "@/lib/db/schema"

export const RESET_MARKER = "vscout.reset"
const ALWAYS = ["vscout2", "vscout", "workbox-expiration"]
const BLOCKED_MS = 5000

export interface UnsyncedSummary {
  changes: number
  drafts: number
  photos: number
  conflicts: number
}

export async function unsyncedSummary(db: VScoutDB): Promise<UnsyncedSummary> {
  const [changes, drafts, photos, conflicts] = await Promise.all([
    db.outbox.count(),
    db.drafts.count(),
    db.mediaUploads.count(),
    db.conflicts.where("status").equals("open").count(),
  ])
  return { changes, drafts, photos, conflicts }
}

export function summaryLines(s: UnsyncedSummary): Array<string> {
  const line = (n: number, one: string, many: string) =>
    n > 0 ? [`${n} ${n === 1 ? one : many}`] : []
  return [
    ...line(s.changes, "change not synced", "changes not synced"),
    ...line(s.drafts, "scouting draft", "scouting drafts"),
    ...line(s.photos, "photo waiting to upload", "photos waiting to upload"),
    ...line(s.conflicts, "conflict to resolve", "conflicts to resolve"),
  ]
}

export const isEmpty = (s: UnsyncedSummary) => summaryLines(s).length === 0

/** The deviceId survives a reset (its refresh family, MQTT cid and push row are keyed by it). */
export function takeResetDeviceId(): string | null {
  try {
    const raw = globalThis.localStorage.getItem(RESET_MARKER)
    if (!raw) return null
    globalThis.localStorage.removeItem(RESET_MARKER)
    const parsed = JSON.parse(raw) as { deviceId?: unknown }
    return typeof parsed.deviceId === "string" ? parsed.deviceId : null
  } catch {
    return null
  }
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name)
    const timer = setTimeout(
      () => reject(new Error(`deleting ${name} is blocked`)),
      BLOCKED_MS
    )
    req.onsuccess = () => {
      clearTimeout(timer)
      resolve()
    }
    req.onerror = () => {
      clearTimeout(timer)
      reject(req.error ?? new Error(`couldn't delete ${name}`))
    }
  })
}

export interface ClearDeps {
  db: VScoutDB
  deviceId: string | null
  /** stop sync and MQTT in this tab */
  quiesce: () => Promise<void>
  channel?: BroadcastChannel
  reload: () => void
}

/** Steps 3–12. Throws (with nothing deleted) if the database can't be deleted. */
export async function clearEverything(d: ClearDeps): Promise<void> {
  await d.quiesce()
  d.channel?.postMessage({ type: "reset-start" })
  d.db.close()
  const listed =
    typeof indexedDB.databases === "function"
      ? (await indexedDB.databases()).flatMap((x) => (x.name ? [x.name] : []))
      : []
  const own = d.db.name
  const names = [...new Set([...ALWAYS, ...listed])]
  // the app's own database first: if it's blocked, nothing else has been touched
  await deleteDatabase(own)
  await Promise.all(
    names
      .filter((n) => n !== own)
      .map((n) => deleteDatabase(n).catch(() => undefined))
  )
  if (typeof caches !== "undefined")
    await Promise.all((await caches.keys()).map((k) => caches.delete(k)))
  try {
    const root = await navigator.storage.getDirectory()
    const entries = (
      root as unknown as { keys: () => AsyncIterable<string> }
    ).keys()
    for await (const name of entries)
      await root.removeEntry(name, { recursive: true })
  } catch {
    // no OPFS in this browser
  }
  try {
    localStorage.clear()
    sessionStorage.clear()
    localStorage.setItem(
      RESET_MARKER,
      JSON.stringify({ deviceId: d.deviceId, at: Date.now() })
    )
  } catch {
    // storage blocked
  }
  const sw = (navigator as { serviceWorker?: ServiceWorkerContainer })
    .serviceWorker
  const regs = sw ? await sw.getRegistrations() : []
  await Promise.all(regs.map((r) => r.unregister()))
  d.channel?.postMessage({ type: "reset-done" })
  d.reload()
}
