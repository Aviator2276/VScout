// The conflict sheet (data-layer §11): what happened, the changed answers side by side, and a
// whole-record choice. Field-level merge is out of scope; scouters decide under time pressure.
import { useState } from "react"
import { Button } from "@/components/controls/button"
import { Sheet } from "@/components/overlays/sheet"
import type { ConflictAction, ConflictView } from "@/lib/sync/conflict-view"
import { cn } from "@/lib/utils"

const LABEL: Record<ConflictAction, string> = {
  "keep-mine": "Keep Mine",
  "keep-theirs": "Keep Server’s",
  discard: "Discard My Change",
  "edit-and-retry": "Edit and Try Again",
}

export function ConflictSheet({
  view,
  onOpenChange,
  onAction,
}: {
  view: ConflictView | null
  onOpenChange: (open: boolean) => void
  onAction: (action: ConflictAction) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const changed = view?.fields.filter((f) => f.changed) ?? []
  return (
    <Sheet open={view !== null} onOpenChange={onOpenChange}>
      {view ? (
        <Sheet.Content
          title="Review Changes"
          description={view.title}
          detent="large"
        >
          <p className="py-2 text-body">{view.summary}</p>
          {changed.length > 0 ? (
            <table className="mt-2 w-full border-separate border-spacing-y-1 text-subhead">
              <thead>
                <tr className="text-footnote text-muted-foreground">
                  <th scope="col" className="text-left font-normal">
                    Answer
                  </th>
                  <th scope="col" className="text-left font-normal">
                    Yours
                  </th>
                  {view.conflict.remote !== null ? (
                    <th scope="col" className="text-left font-normal">
                      Server’s
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {changed.map((f) => (
                  <tr key={f.path}>
                    <th scope="row" className="pe-2 text-left font-normal">
                      {f.label}
                    </th>
                    <td className="rounded-s-lg bg-primary/10 px-2 py-1">
                      {f.mine}
                    </td>
                    {view.conflict.remote !== null ? (
                      <td className={cn("rounded-e-lg bg-muted px-2 py-1")}>
                        {f.theirs ?? "—"}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          <div className="mt-6 flex flex-col gap-2">
            {view.actions.map((a, i) => (
              <Button
                key={a}
                size="large"
                variant={i === 0 ? "primary" : "secondary"}
                disabled={busy}
                onClick={() => {
                  setBusy(true)
                  void onAction(a).finally(() => setBusy(false))
                }}
              >
                {LABEL[a]}
              </Button>
            ))}
          </div>
        </Sheet.Content>
      ) : null}
    </Sheet>
  )
}
