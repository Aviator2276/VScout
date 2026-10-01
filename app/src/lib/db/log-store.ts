// Persists logger entries to Dexie (batched) so Settings → Diagnostics can export them.
import { setLogSink } from "@/lib/logger"
import type { LogEntry } from "@/lib/logger"
import type { VScoutDB } from "./schema"

const MAX_ROWS = 2000

export function attachLogStore(
  db: VScoutDB,
  flushMs = 2000,
  maxRows = MAX_ROWS
): () => void {
  let pending: Array<LogEntry> = []
  let timer: ReturnType<typeof setTimeout> | null = null

  const flush = async () => {
    timer = null
    const batch = pending
    pending = []
    if (batch.length === 0) return
    await db.logs.bulkAdd(batch)
    const count = await db.logs.count()
    if (count > maxRows) {
      const old = await db.logs
        .orderBy("id")
        .limit(count - maxRows)
        .primaryKeys()
      await db.logs.bulkDelete(old)
    }
  }

  setLogSink((entry) => {
    pending.push(entry)
    timer ??= setTimeout(() => void flush(), flushMs)
  })
  return () => {
    setLogSink(null)
    if (timer) clearTimeout(timer)
    void flush()
  }
}
