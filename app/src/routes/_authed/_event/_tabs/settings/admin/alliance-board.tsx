import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { Segmented } from "@/components/controls/segmented"
import { DataView } from "@/components/data-view/data-view"
import { NavBackButton } from "@/components/layout/nav-back-button"
import { StackPage } from "@/components/layout/stack-page"
import { List } from "@/components/list/list"
import { ConfirmAlert } from "@/components/overlays/confirm-alert"
import { useAllianceBoard } from "@/features/alliance-selection/api/get-board"
import { useOnline } from "@/hooks/use-online"
import type { BoardAction } from "@/lib/contracts/alliance-board"
import { useLiveActions } from "@/lib/db/react/data-runtime"
import type { AllianceBoardRecord } from "@/lib/db/types"

export const Route = createFileRoute(
  "/_authed/_event/_tabs/settings/admin/alliance-board"
)({
  component: AdminBoard,
})

const STATUS = [
  { value: "notStarted", label: "Not Started" },
  { value: "inProgress", label: "In Progress" },
  { value: "done", label: "Done" },
] as const

// AD11: status, lock, reset. Online-only actions, MQTT RPC first with HTTP fallback (ADR-064);
// nothing is queued.
function AdminBoard() {
  const { event } = Route.useRouteContext()
  const state = useAllianceBoard(event.key)
  const live = useLiveActions()
  const online = useOnline()
  const [resetAsk, setResetAsk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const send = async (board: AllianceBoardRecord, action: BoardAction) => {
    setBusy(true)
    const r = await live.boardAction(event.key, board.rev, action)
    setBusy(false)
    setError(r.kind !== "ok" && r.kind !== "already")
  }
  return (
    <StackPage
      title="Live Alliance Board"
      leading={<NavBackButton parentHref="/settings/admin" label="Admin" />}
    >
      <DataView state={state} size="page">
        <DataView.Missing
          not-found={{ title: "Alliance board not downloaded yet" }}
        />
        <DataView.Error title="Couldn’t load the board." />
        <DataView.Success>
          {(board: AllianceBoardRecord) => {
            const disabled = !online || busy
            return (
              <>
                {online ? null : (
                  <p
                    role="status"
                    className="mt-2 rounded-xl bg-muted px-3 py-2 text-footnote"
                  >
                    Needs connection
                  </p>
                )}
                <section className="mt-4 flex flex-col gap-2">
                  <h2 className="px-4 text-footnote text-muted-foreground uppercase">
                    Status
                  </h2>
                  {/* a disabled fieldset disables every segment while offline or sending */}
                  <fieldset disabled={disabled} className="disabled:opacity-50">
                    <Segmented
                      label="Board status"
                      value={board.status}
                      onValueChange={(status) =>
                        void send(board, { kind: "setStatus", status })
                      }
                      options={STATUS}
                    />
                  </fieldset>
                  {board.status === "notStarted" ? (
                    <p className="px-4 text-footnote text-muted-foreground">
                      Selection hasn’t started.
                    </p>
                  ) : null}
                </section>
                <List.Section footer="When locked, only admins can record picks.">
                  <List.Toggle
                    title="Lock board"
                    checked={board.locked}
                    disabled={disabled}
                    onCheckedChange={(lock) =>
                      void send(board, { kind: lock ? "lock" : "unlock" })
                    }
                  />
                </List.Section>
                <List.Section>
                  <List.Row
                    title="History"
                    href="/scout/alliance-selection?sheet=history"
                  />
                  <List.Row
                    title={
                      <span className="text-destructive">Reset Board</span>
                    }
                    {...(disabled
                      ? { detail: online ? undefined : "Needs connection" }
                      : { onSelect: () => setResetAsk(true) })}
                  />
                </List.Section>
                {error ? (
                  <p
                    role="alert"
                    className="px-4 text-footnote text-destructive"
                  >
                    Couldn’t update the board. Try again.
                  </p>
                ) : null}
                <ConfirmAlert
                  open={resetAsk}
                  onOpenChange={setResetAsk}
                  title="Reset the Board?"
                  description="Every pick and decline is cleared for everyone. Captains come back from the rankings."
                  confirmLabel="Reset"
                  tone="destructive"
                  onConfirm={() => void send(board, { kind: "reset" })}
                />
              </>
            )
          }}
        </DataView.Success>
      </DataView>
    </StackPage>
  )
}
