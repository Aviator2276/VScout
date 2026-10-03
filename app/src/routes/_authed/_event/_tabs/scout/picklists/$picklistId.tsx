import { TeamPreviewSheet } from "@/features/teams/components/team-preview-sheet"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import { z } from "zod"
import { picklistChips } from "@/app/picklist-chips"
import { Ellipsis } from "@/components/icons/icon"
import { NavBackButton } from "@/components/layout/nav-back-button"
import { StackPage } from "@/components/layout/stack-page"
import { ActionMenu } from "@/components/overlays/menu"
import { ConfirmAlert } from "@/components/overlays/confirm-alert"
import { useToast } from "@/components/overlays/toaster"
import { usePickedTeams } from "@/features/alliance-selection/api/get-board"
import {
  useEventTeamNames,
  usePicklist,
  usePicklistWrites,
  usePicklists,
} from "@/features/picklists/api/get-picklists"
import type { PicklistRow } from "@/features/picklists/api/get-picklists"
import {
  AddTeamsSheet,
  PicklistEditor,
  ReasonSheet,
} from "@/features/picklists/components/picklist-editor"
import { compareDeltas } from "@/features/picklists/utils/combine"
import { useEventTeamMetrics } from "@/hooks/use-event-team-metrics"
import { can } from "@/lib/authorization"

export const Route = createFileRoute(
  "/_authed/_event/_tabs/scout/picklists/$picklistId"
)({
  validateSearch: z.object({
    compare: z.string().max(40).optional().catch(undefined),
    sheet: z.enum(["add-teams", "reason"]).optional().catch(undefined),
    team: z.coerce.number().int().optional().catch(undefined),
  }),
  component: PicklistRoute,
})

function PicklistRoute() {
  const [preview, setPreview] = useState<number | null>(null)
  const { picklistId } = Route.useParams()
  const { event, session } = Route.useRouteContext()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const go = useNavigate()
  const toast = useToast()
  const state = usePicklist(event.key, picklistId)
  const other = usePicklist(event.key, search.compare ?? "")
  const all = usePicklists(event.key)
  const writes = usePicklistWrites(event.key)
  const metrics = useEventTeamMetrics(event.key, "all")
  const picked = usePickedTeams(event.key)
  const teams = useEventTeamNames(event.key)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const detail = state.status === "success" ? state.data : null
  const rows = detail?.rows ?? []
  const chips = useMemo(
    () => picklistChips(detail?.list.purpose ?? "first", metrics.byTeam),
    [detail?.list.purpose, metrics.byTeam]
  )
  const deltas =
    search.compare && other.status === "success"
      ? compareDeltas(
          rows.map((r) => r.teamNumber),
          other.data.rows.map((r) => r.teamNumber)
        )
      : null
  const reasonRow =
    search.sheet === "reason"
      ? (rows.find((r) => r.teamNumber === search.team) ?? null)
      : null
  const setSheet = (sheet: "add-teams" | "reason" | undefined, team?: number) =>
    void navigate({
      search: (p) => ({ ...p, sheet, team }),
      replace: sheet === undefined,
    })

  const remove = async (row: PicklistRow) => {
    const undo = await writes.remove(row, picklistId)
    toast.show({
      title: `Removed ${row.teamNumber}`,
      action: { label: "Undo", onAction: () => void undo() },
    })
  }

  const compareChoices =
    all.status === "success" ? all.data.filter((p) => p.id !== picklistId) : []

  return (
    <StackPage
      title={detail?.list.name ?? "Picklist"}
      titleMode="inline"
      leading={
        <NavBackButton parentHref="/scout/picklists" label="Picklists" />
      }
      trailing={
        <ActionMenu
          trigger={<Ellipsis aria-hidden size={22} />}
          actions={[
            ...compareChoices.slice(0, 5).map((p) => ({
              label: `Compare with ${p.name}`,
              onSelect: () =>
                void navigate({
                  search: (s) => ({ ...s, compare: p.id }),
                  replace: true,
                }),
            })),
            ...(search.compare
              ? [
                  {
                    label: "Stop Comparing",
                    onSelect: () =>
                      void navigate({
                        search: (s) => ({ ...s, compare: undefined }),
                        replace: true,
                      }),
                  },
                ]
              : []),
            ...(detail?.mine
              ? [
                  {
                    label: "Delete Picklist",
                    destructive: true,
                    onSelect: () => setConfirmDelete(true),
                  },
                ]
              : []),
          ]}
        />
      }
    >
      <PicklistEditor
        state={state}
        chips={chips}
        deltas={deltas}
        picked={picked}
        onMove={(from, to) => {
          const order = rows.map((r) => r.rank)
          const moving = rows[from]
          if (!moving) return
          const rest = order.filter((_, i) => i !== from)
          void writes.move(moving.id, rest[to - 1] ?? null, rest[to] ?? null)
        }}
        onRemove={(row) => void remove(row)}
        onReason={(row) => setSheet("reason", row.teamNumber)}
        onAddTeams={() => setSheet("add-teams")}
        onPreview={setPreview}
        onCopy={
          detail && !detail.mine && can(session, "picklist:create")
            ? () =>
                void writes
                  .create({
                    name: `${detail.list.name} (copy)`,
                    purpose: detail.list.purpose,
                    teams: rows.map((r) => r.teamNumber),
                    reasons: new Map(
                      rows
                        .filter((r) => r.reason)
                        .map((r) => [r.teamNumber, r.reason])
                    ),
                  })
                  .then((l) =>
                    go({
                      to: "/scout/picklists/$picklistId",
                      params: { picklistId: l.id },
                    })
                  )
            : undefined
        }
      />
      {detail?.mine ? (
        <>
          <AddTeamsSheet
            open={search.sheet === "add-teams"}
            onOpenChange={(open) => {
              if (!open) setSheet(undefined)
            }}
            teams={teams.filter(
              (t) => !rows.some((r) => r.teamNumber === t.teamNumber)
            )}
            onAdd={async (list) => {
              await writes.addTeams(picklistId, rows.at(-1)?.rank ?? null, list)
              setSheet(undefined)
            }}
          />
          <ReasonSheet
            row={reasonRow}
            onOpenChange={(open) => {
              if (!open) setSheet(undefined)
            }}
            onSave={async (reason) => {
              if (reasonRow) await writes.setReason(reasonRow.id, reason)
              setSheet(undefined)
            }}
          />
          <ConfirmAlert
            open={confirmDelete}
            onOpenChange={setConfirmDelete}
            title="Delete this picklist?"
            description="Everyone loses access to it. This can’t be undone."
            confirmLabel="Delete"
            cancelLabel="Cancel"
            tone="destructive"
            onConfirm={() => {
              void writes
                .deleteList(detail)
                .then(() => go({ to: "/scout/picklists", replace: true }))
            }}
          />
        </>
      ) : null}
      <TeamPreviewSheet
        eventKey={event.key}
        teamNumber={preview}
        onOpenChange={(open) => {
          if (!open) setPreview(null)
        }}
        onViewTeam={(n) => {
          setPreview(null)
          void go({
            to: "/teams/$teamNumber",
            params: { teamNumber: String(n) },
          })
        }}
      />
    </StackPage>
  )
}
