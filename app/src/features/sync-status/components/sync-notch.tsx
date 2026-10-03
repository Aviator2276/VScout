// The Sync Status notch's content (features/sync-status.md S1): downlink, connection, uplink. A tap
// opens the Sync details as a large tooltip hanging from the notch (owner, 2026-10-03), with a caret
// pointing at it; tapping outside or Escape closes it, and focus returns to the notch.
import { useRef, useState } from "react"
import { AnchoredPopover } from "@/components/overlays/anchored-popover"
import { ConnectionGlyph } from "@/components/sync/connection-glyph"
import type { ConnectionShown } from "@/components/sync/connection-glyph"
import { StatusNotch } from "@/components/sync/status-notch"
import { TransmitGlyph } from "@/components/sync/transmit-glyph"
import { bitLoopSeconds } from "@/lib/network/network-status"
import type { NetworkStatus } from "@/lib/network/network-status"
import { useNetworkStatus } from "../api/use-network-status"
import { conflictStore } from "../stores/conflict"
import { SyncPanel } from "./sync-panel"

export function connectionShown(s: NetworkStatus): ConnectionShown {
  if (s.connection === "offline") return { kind: "offline" }
  if (s.attention) return { kind: "attention" }
  return {
    kind: "bars",
    quality: s.quality,
    sweeping: s.connection !== "online",
  }
}

export function SyncNotch({
  attached,
  onNavigate,
}: {
  attached: boolean
  /** the app layer navigates */
  onNavigate: (href: string) => void
}) {
  const status = useNetworkStatus()
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  return (
    <>
      <StatusNotch
        attached={attached}
        label={`Sync status: ${status.summary}`}
        expanded={open}
        buttonRef={anchor}
        onSelect={() => setOpen((o) => !o)}
      >
        <TransmitGlyph
          direction="down"
          mode={status.down.mode}
          loopSeconds={bitLoopSeconds(status.down.bps)}
          color="var(--notch-down)"
        />
        <ConnectionGlyph shown={connectionShown(status)} />
        <TransmitGlyph
          direction="up"
          mode={status.up.mode}
          loopSeconds={bitLoopSeconds(status.up.bps)}
          waiting={status.up.waiting}
          color="var(--notch-up)"
        />
      </StatusNotch>
      <AnchoredPopover
        open={open}
        onOpenChange={setOpen}
        anchor={anchor}
        title="Sync"
        className="w-[min(23rem,calc(100vw-1.5rem))]"
      >
        {/* the content scrolls inside the tooltip; Recent also scrolls on its own */}
        <div className="max-h-[min(70dvh,40rem)] overflow-y-auto overscroll-contain p-3">
          {open ? (
            <SyncPanel
              onConflict={(v) => {
                setOpen(false)
                conflictStore.set(v)
              }}
              onNavigate={(href) => {
                setOpen(false)
                onNavigate(href)
              }}
            />
          ) : null}
        </div>
      </AnchoredPopover>
    </>
  )
}
