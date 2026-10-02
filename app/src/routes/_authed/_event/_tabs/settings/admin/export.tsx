import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { NavBackButton } from "@/components/layout/nav-back-button"
import { StackPage } from "@/components/layout/stack-page"
import { List } from "@/components/list/list"
import { useExport } from "@/features/admin/api/export-data"
import type { ExportKind } from "@/features/admin/api/export-data"

export const Route = createFileRoute(
  "/_authed/_event/_tabs/settings/admin/export"
)({
  component: Export,
})

function download(name: string, type: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// AD7: generated on this device from what's synced, so it works offline.
function Export() {
  const { event } = Route.useRouteContext()
  const run = useExport(event.key)
  const [status, setStatus] = useState<{
    kind: ExportKind
    text: string
  } | null>(null)
  const go = async (kind: ExportKind) => {
    setStatus({ kind, text: "Preparing export…" })
    try {
      const file = await run(kind)
      if (file.count === 0 && kind === "entries-csv") {
        setStatus({ kind, text: "Nothing to export for this event." })
        return
      }
      download(file.name, file.type, file.text)
      setStatus({
        kind,
        text: `Exported ${file.count} ${file.count === 1 ? "entry" : "entries"}.`,
      })
    } catch {
      setStatus({ kind, text: "Export failed. Try again." })
    }
  }
  const note = (kind: ExportKind) =>
    status?.kind === kind ? status.text : undefined
  return (
    <StackPage
      title="Export"
      leading={<NavBackButton parentHref="/settings/admin" label="Admin" />}
    >
      <List.Section footer="Built on this device from synced data. Works offline.">
        <List.Row
          title="Match Entries (CSV)"
          subtitle={
            note("entries-csv") ?? "One row per entry, labelled columns"
          }
          onSelect={() => void go("entries-csv")}
        />
        <List.Row
          title="Everything (JSON)"
          subtitle={
            note("all-json") ??
            "Entries, pit and post-scouting, team notes, picklists, matches"
          }
          onSelect={() => void go("all-json")}
        />
      </List.Section>
      <p role="status" aria-live="polite" className="sr-only">
        {status?.text}
      </p>
    </StackPage>
  )
}
