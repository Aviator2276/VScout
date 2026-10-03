// The Sync Status notch's content (features/sync-status.md S1): downlink, connection, uplink. Reads
// the derived status and opens the Sync sheet.
import { StatusNotch } from "@/components/sync/status-notch"
import { ConnectionGlyph } from "@/components/sync/connection-glyph"
import type { ConnectionShown } from "@/components/sync/connection-glyph"
import { TransmitGlyph } from "@/components/sync/transmit-glyph"
import { bitLoopSeconds } from "@/lib/network/network-status"
import type { NetworkStatus } from "@/lib/network/network-status"
import { useNetworkStatus } from "../api/use-network-status"
import { syncSheetStore } from "../stores/sync-sheet"

/** Light blue and light purple: system cyan and a lavender, legible on the black pill. */
export const DOWN_COLOR = "#64D2FF"
export const UP_COLOR = "#C7A2FF"

export function connectionShown(s: NetworkStatus): ConnectionShown {
  if (s.connection === "offline") return { kind: "offline" }
  if (s.attention) return { kind: "attention" }
  return {
    kind: "bars",
    quality: s.quality,
    sweeping: s.connection !== "online",
  }
}

export function SyncNotch({ attached }: { attached: boolean }) {
  const status = useNetworkStatus()
  return (
    <StatusNotch
      attached={attached}
      label={`Sync status: ${status.summary}`}
      onSelect={() => syncSheetStore.set(true)}
    >
      <TransmitGlyph
        direction="down"
        mode={status.down.mode}
        loopSeconds={bitLoopSeconds(status.down.bps)}
        color={DOWN_COLOR}
      />
      <ConnectionGlyph shown={connectionShown(status)} />
      <TransmitGlyph
        direction="up"
        mode={status.up.mode}
        loopSeconds={bitLoopSeconds(status.up.bps)}
        waiting={status.up.waiting}
        color={UP_COLOR}
      />
    </StatusNotch>
  )
}
