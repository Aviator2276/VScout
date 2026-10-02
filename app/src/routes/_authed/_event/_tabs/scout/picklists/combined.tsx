import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useMemo } from "react"
import { z } from "zod"
import { NavBackButton } from "@/components/layout/nav-back-button"
import { StackPage } from "@/components/layout/stack-page"
import { useToast } from "@/components/overlays/toaster"
import {
  usePicklistWrites,
  usePicklists,
} from "@/features/picklists/api/get-picklists"
import { useCombineSources } from "@/features/picklists/api/get-combined"
import { CombinedView } from "@/features/picklists/components/combined-view"
import { combineLists } from "@/features/picklists/utils/combine"
import { can } from "@/lib/authorization"

export const Route = createFileRoute(
  "/_authed/_event/_tabs/scout/picklists/combined"
)({
  validateSearch: z.object({
    from: z.array(z.string().max(40)).max(20).optional().catch(undefined),
    method: z.enum(["average-rank", "borda"]).optional().catch(undefined),
    weightFollowed: z.boolean().optional().catch(undefined),
  }),
  component: Combined,
})

function Combined() {
  const { event, session } = Route.useRouteContext()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const go = useNavigate()
  const toast = useToast()
  const lists = usePicklists(event.key)
  const sources = useCombineSources(event.key)
  const writes = usePicklistWrites(event.key)
  const summaries = lists.status === "success" ? lists.data : []
  // default: every ranking list with the same purpose as the followed (or first) list
  const purpose =
    summaries.find((l) => l.followed)?.purpose ??
    summaries[0]?.purpose ??
    "first"
  const selected =
    search.from ??
    summaries
      .filter((l) => l.purpose === purpose && l.purpose !== "dnp")
      .map((l) => l.id)
  const method = search.method ?? "average-rank"
  const rows = useMemo(
    () =>
      combineLists(
        sources.lists.filter(
          (l) => selected.includes(l.id) || l.purpose === "dnp"
        ),
        method,
        { weightFollowed: search.weightFollowed === true }
      ),
    [sources.lists, selected, method, search.weightFollowed]
  )
  return (
    <StackPage
      title="Combined Picklist"
      leading={
        <NavBackButton parentHref="/scout/picklists" label="Picklists" />
      }
    >
      <CombinedView
        sources={summaries
          .filter((l) => l.purpose !== "dnp")
          .map((l) => ({ id: l.id, label: `${l.name} · ${l.ownerName}` }))}
        selected={selected}
        onSelectedChange={(from) =>
          void navigate({ search: (p) => ({ ...p, from }), replace: true })
        }
        method={method}
        onMethodChange={(m) =>
          void navigate({ search: (p) => ({ ...p, method: m }), replace: true })
        }
        rows={rows}
        nicknames={sources.nicknames}
        onSave={
          can(session, "picklist:create")
            ? () =>
                void writes
                  .create({
                    name: "Combined",
                    purpose: purpose === "dnp" ? "first" : purpose,
                    teams: rows.map((r) => r.teamNumber),
                  })
                  .then((l) => {
                    toast.show({ title: "Saved to your lists" })
                    return go({
                      to: "/scout/picklists/$picklistId",
                      params: { picklistId: l.id },
                    })
                  })
            : undefined
        }
      />
    </StackPage>
  )
}
