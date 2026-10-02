// The sync pill and its sheet: what's waiting, when it last synced, and Sync Now.
import { useState } from "react"
import { Button } from "@/components/controls/button"
import { Sheet } from "@/components/overlays/sheet"
import { formatAgo } from "@/components/sync/sync-badge"
import {
  SyncPill,
  describeSyncPill,
  syncPillState,
} from "@/components/sync/sync-pill"
import { useDataRuntime } from "@/lib/db/react/data-runtime"
import { useSyncSummary } from "../api/use-sync-summary"

export function SyncStatusButton() {
  const summary = useSyncSummary()
  const { requestSync } = useDataRuntime()
  const [open, setOpen] = useState(false)
  const [openedAt, setOpenedAt] = useState(0)
  const state = syncPillState(summary)
  return (
    <>
      <SyncPill
        state={state}
        onSelect={() => {
          setOpenedAt(Date.now())
          setOpen(true)
        }}
      />
      <Sheet open={open} onOpenChange={setOpen}>
        <Sheet.Content title="Sync" detent="medium">
          <p className="text-body">{describeSyncPill(state).label}.</p>
          <p className="mt-1 text-subhead text-muted-foreground">
            {summary.lastSuccessAt
              ? `Last synced ${formatAgo(openedAt - summary.lastSuccessAt)}.`
              : "Not synced yet on this device."}
          </p>
          <Button
            className="mt-6"
            size="large"
            disabled={!summary.online || !requestSync}
            onClick={() => requestSync?.()}
          >
            Sync Now
          </Button>
          {summary.online ? null : (
            <p className="mt-2 text-center text-footnote text-muted-foreground">
              Syncing needs a connection.
            </p>
          )}
        </Sheet.Content>
      </Sheet>
    </>
  )
}
