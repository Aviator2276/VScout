// Typed bookkeeping keys (data-layer §4.1). No free-form keys: add one here with its type.
import type { VScoutDB } from "./schema"

export interface KvKeys {
  deviceId: string
  pinnedEventKeys: Array<string>
  storagePersisted: boolean
  clockSkewMs: number
  legacyCleanupDone: boolean
  needsAppUpdate: boolean
  [key: `lastFullSyncAt:${string}`]: number
  [key: `gameSchemaApplied:${string}`]: number
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
