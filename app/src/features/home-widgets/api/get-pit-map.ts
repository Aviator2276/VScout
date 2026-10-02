// The event's pit map (features/home.md, http-api-contract §5.3): cached in kv for offline use and
// refreshed when it's missing or older than an hour while online.
import { useEffect, useState } from "react"
import { useOnline } from "@/hooks/use-online"
import type { WirePitMap } from "@/lib/contracts/pit-map"
import { getKv } from "@/lib/db/kv"
import { useDataRuntime } from "@/lib/db/react/data-runtime"
import { useLive } from "@/lib/db/react/use-live"

const STALE_MS = 3_600_000

export type PitMapState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "error"; retry: () => void }
  | { status: "success"; map: WirePitMap; fetchedAt: number; stale: boolean }

export function usePitMap(eventKey: string, now: number): PitMapState {
  const { db, live } = useDataRuntime()
  const online = useOnline()
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const cached = useLive(() => getKv(db, `pitMap:${eventKey}`), [db, eventKey])
  const entry = cached?.kind === "ok" ? cached.value : undefined
  const fetchedAt = entry?.fetchedAt
  const loaded = cached !== undefined

  useEffect(() => {
    if (!live || !online || !loaded) return
    if (
      fetchedAt !== undefined &&
      Date.now() - fetchedAt < STALE_MS &&
      attempt === 0
    )
      return
    let active = true
    void live.refreshPitMap(eventKey).then((r) => {
      if (active) setFailed(r.kind !== "ok")
    })
    return () => {
      active = false
    }
  }, [live, online, loaded, eventKey, fetchedAt, attempt])

  if (!loaded) return { status: "loading" }
  if (entry?.map)
    return {
      status: "success",
      map: entry.map,
      fetchedAt: entry.fetchedAt,
      stale: !online || now - entry.fetchedAt > STALE_MS,
    }
  if (entry && !failed) return { status: "missing" }
  if (failed || !online)
    return { status: "error", retry: () => setAttempt((n) => n + 1) }
  return { status: "loading" }
}
