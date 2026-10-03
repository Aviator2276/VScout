// MQTT → database (mqtt.md §7, data-layer §7.5): decode a batch of raw envelopes and apply them in
// ONE transaction. Invalid envelopes are dropped and logged; the rest still apply.
import { decodeChangeEnvelope } from "@/lib/api/adapters/change-envelope-adapter"
import type { DomainChange } from "@/lib/api/adapters/change-envelope-adapter"
import { logger } from "@/lib/logger"
import { applyChanges, logApplyResults } from "./apply-envelope"
import type { ApplyCtx, ApplyResult } from "./apply-envelope"

export interface IngestResult {
  results: Array<ApplyResult>
  dropped: number
}

export function createIngest(ctx: ApplyCtx) {
  return async function ingestMany(
    raws: ReadonlyArray<unknown>
  ): Promise<IngestResult> {
    const changes: Array<DomainChange> = []
    let dropped = 0
    for (const raw of raws) {
      const r = decodeChangeEnvelope(raw)
      if (r.ok) changes.push(r.change)
      else {
        dropped++
        logger.warn("sync", `invalid envelope dropped (${r.reason})`)
      }
    }
    const results = await applyChanges(changes, ctx)
    logApplyResults(results, "mqtt")
    return { results, dropped }
  }
}
