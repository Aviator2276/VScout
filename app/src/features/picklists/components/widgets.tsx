// The Followed Picklist widget (features/home.md H5): the top of the list the admin follows.
import { DataView } from "@/components/data-view/data-view"
import { WidgetCard } from "@/components/grid/widget-card"
import { ClipboardList } from "@/components/icons/icon"
import { useDataRuntime } from "@/lib/db/react/data-runtime"
import { useLiveOr } from "@/lib/db/react/data-state-hooks"
import type { DataState } from "@/lib/db/react/data-state"
import type { WidgetProps } from "@/types/widget"
import { usePicklist } from "../api/get-picklists"
import type { PicklistDetail } from "../api/get-picklists"

export function FollowedPicklistWidget({ eventKey, h }: WidgetProps) {
  const { db } = useDataRuntime()
  const followedId = useLiveOr(
    async () =>
      (await db.eventSettings.get(eventKey))?.followedPicklistId ?? null,
    [eventKey],
    null
  )
  const detail = usePicklist(eventKey, followedId ?? "")
  const state: DataState<PicklistDetail> =
    followedId === null
      ? { status: "missing", reason: "not-found" }
      : detail.status === "success" && detail.data.rows.length === 0
        ? { status: "empty" }
        : detail
  return (
    <WidgetCard
      title="Followed Picklist"
      href={followedId ? `/scout/picklists/${followedId}` : "/scout/picklists"}
    >
      <DataView state={state} size="inline">
        <DataView.Empty
          icon={ClipboardList}
          title="The followed picklist is empty"
        />
        <DataView.Missing
          not-found={{
            icon: ClipboardList,
            title: "No picklist is being followed yet",
          }}
        />
        <DataView.Error title="Couldn’t load the picklist." />
        <DataView.Success>
          {(d: PicklistDetail) => (
            <ol className="flex flex-col gap-0.5 text-subhead">
              {d.rows.slice(0, Math.max(1, h * 2 - 1)).map((r, i) => (
                <li key={r.id} className="flex gap-2">
                  <span className="w-6 text-muted-foreground tabular-nums">
                    {i + 1}
                  </span>
                  <span className="font-heading tabular-nums">
                    {r.teamNumber}
                  </span>
                  <span className="truncate text-muted-foreground">
                    {r.nickname}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </DataView.Success>
      </DataView>
    </WidgetCard>
  )
}
