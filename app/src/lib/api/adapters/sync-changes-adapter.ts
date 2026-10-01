// GET /sync/changes page → decoded changes. A bad envelope is reported, never fatal: the page
// still applies and the cursor still advances (the server re-sends a fixed record at a new rev).
import { syncChangesResponse } from "@/lib/contracts/sync-changes"
import type { DomainChange } from "./change-envelope-adapter"
import { decodeChangeEnvelope } from "./change-envelope-adapter"
import type { DecodeResult } from "./entity-registry"
import { isoToMs } from "./time"

export interface SyncChangesPage {
  changes: Array<DomainChange>
  rejected: Array<{ index: number; reason: string }>
  cursors: Record<string, string>
  hasMore: boolean
  serverTime: number
}

export function decodeSyncChanges(raw: unknown): DecodeResult<SyncChangesPage> {
  const parsed = syncChangesResponse.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error }
  const changes: Array<DomainChange> = []
  const rejected: Array<{ index: number; reason: string }> = []
  parsed.data.changes.forEach((c, index) => {
    const r = decodeChangeEnvelope(c)
    if (r.ok) changes.push(r.change)
    else rejected.push({ index, reason: r.reason })
  })
  return {
    ok: true,
    value: {
      changes,
      rejected,
      cursors: parsed.data.cursors,
      hasMore: parsed.data.hasMore,
      serverTime: isoToMs(parsed.data.serverTime),
    },
  }
}
