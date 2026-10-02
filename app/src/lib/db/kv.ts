// Typed bookkeeping keys (data-layer §4.1). No free-form keys: add one here with its type.
import type { VScoutDB } from "./schema"

import type { WirePitMap } from "@/lib/contracts/pit-map"

export interface KvKeys {
  deviceId: string
  pinnedEventKeys: Array<string>
  storagePersisted: boolean
  clockSkewMs: number
  legacyCleanupDone: boolean
  needsAppUpdate: boolean
  /** push pre-prompt dismissals (push-notifications.md §2.1) */
  pushPrompt: { dismissals: number; lastDismissedAt: number | null }
  /** the subscription the server last heard about (reconcile: re-PUT when it changes or daily) */
  pushLastPut: { endpoint: string; key: string; at: number } | null
  /** urgent announcements this device has acknowledged (scout-tab.md D3) */
  ackedAnnouncements: Array<string>
  /** per-channel read cursor: the newest createdAt seen (scout-tab.md D1, ADR-033 device data) */
  [key: `readCursor:${string}`]: number
  [key: `lastFullSyncAt:${string}`]: number
  [key: `gameSchemaApplied:${string}`]: number
  /** validation flags an admin marked reviewed (features/admin.md AD4), this device only */
  [key: `reviewedFlags:${string}`]: Array<string>
  /** the event's pit map (http-api-contract §5.3), cached for offline */
  [key: `pitMap:${string}`]: { map: WirePitMap | null; fetchedAt: number }
}

export async function getKv<TKey extends keyof KvKeys & string>(
  db: VScoutDB,
  key: TKey
): Promise<KvKeys[TKey] | undefined> {
  const row = await db.kv.get(key)
  return row?.value as KvKeys[TKey] | undefined
}

export async function setKv<TKey extends keyof KvKeys & string>(
  db: VScoutDB,
  key: TKey,
  value: KvKeys[TKey]
): Promise<void> {
  await db.kv.put({ key, value })
}
