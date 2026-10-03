// The notch's state (features/sync-status.md S1): telemetry from the runtime, the browser's online
// flag, and the outbox/conflict counts that every tab reads from Dexie.
import { useSyncExternalStore } from "react"
import { useOnline } from "@/hooks/use-online"
import { useDataRuntime } from "@/lib/db/react/data-runtime"
import { deriveNetworkStatus } from "@/lib/network/network-status"
import type { NetworkStatus } from "@/lib/network/network-status"
import { EMPTY_NETWORK } from "@/lib/network/network-telemetry"
import type { NetworkSnapshot } from "@/lib/network/network-telemetry"
import { useSyncSummary } from "./use-sync-summary"

const noop = () => () => undefined
const empty = () => EMPTY_NETWORK

export function useNetworkSnapshot(): NetworkSnapshot {
  const { network } = useDataRuntime()
  return useSyncExternalStore(
    network?.subscribe ?? noop,
    network?.getSnapshot ?? empty,
    empty
  )
}

export function useNetworkStatus(): NetworkStatus & {
  network: NetworkSnapshot
  pending: number
  attentionCount: number
} {
  const network = useNetworkSnapshot()
  const online = useOnline()
  const summary = useSyncSummary()
  const attentionCount =
    summary.conflicts + summary.rejected + (summary.signInNeeded ? 1 : 0)
  return {
    ...deriveNetworkStatus({
      online,
      network,
      pending: summary.pending,
      attention: attentionCount,
    }),
    network,
    pending: summary.pending,
    attentionCount,
  }
}
