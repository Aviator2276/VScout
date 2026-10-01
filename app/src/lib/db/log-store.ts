// Persists logger entries to Dexie (batched) so Settings → Diagnostics can export them.
import { setLogSink } from "@/lib/logger"
import type { LogEntry } from "@/lib/logger"
import type { VScoutDB } from "./schema"

const MAX_ROWS = 2000

/** Returns a detach function that resolves once every pending entry is written. */
export function attachLogStore(
  db: VScoutDB,
  flushMs = 2000,
  maxRows = MAX_ROWS
): () => Promise<void> {
  let pending: Array<LogEntry> = []
  let timer: ReturnType<typeof setTimeout> | null = null
  // flushes run one after another so a trim never races a write
  let chain: Promise<void> = Promise.resolve()

  const writeBatch = async () => {
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

  const flush = () => {
    timer = null
    chain = chain.then(writeBatch, writeBatch)
    return chain
  }

  setLogSink((entry) => {
    pending.push(entry)
    timer ??= setTimeout(() => void flush(), flushMs)
  })
  return () => {
    setLogSink(null)
    if (timer) clearTimeout(timer)
    return flush()
  }
}
