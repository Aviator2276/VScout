// Home widgets owned by scouting (features/home.md H5): Needs Scouting, Resume Drafts, My Coverage,
// Coverage Overview.
import { use } from "react"
import { DataView } from "@/components/data-view/data-view"
import { WidgetCard } from "@/components/grid/widget-card"
import { CircleCheck, ClipboardList, Lock } from "@/components/icons/icon"
import { ListLinkContext } from "@/components/list/list"
import { useOurTeam } from "@/hooks/use-our-team"
import { useWatchedTeams } from "@/hooks/use-prefs"
import { useDataRuntime, useViewer } from "@/lib/db/react/data-runtime"
import { useCollectionState } from "@/lib/db/react/data-state-hooks"
import type { DataState } from "@/lib/db/react/data-state"
import type { WidgetProps } from "@/types/widget"
import { parseMatchKey, shortMatchLabel } from "@/utils/match-label"
import { useMyDrafts, useRecommendation } from "../api/get-recommendations"
import type { Recommendation } from "../utils/recommend-slots"
import { stationLabel } from "./match-scouting"
import { reasonText, scoutHref } from "./needs-scouting"

export function NeedsScoutingWidget({ eventKey, h }: WidgetProps) {
  const ourTeam = useOurTeam()
  const { watched } = useWatchedTeams()
  const rec = useRecommendation(eventKey, { ourTeam, watched })
  const renderLink = use(ListLinkContext)
  return (
    <WidgetCard title="Needs Scouting" href="/scout/needs-scouting">
      <DataView state={rec} size="inline">
        <DataView.Idle icon={Lock} title="Scouting is closed for now" />
        <DataView.Empty
          icon={CircleCheck}
          title="Every upcoming robot is covered"
        />
        <DataView.Missing
          not-synced={{ title: "Match schedule not downloaded yet" }}
        />
        <DataView.Error title="Couldn’t work out what needs scouting." />
        <DataView.Success>
          {(r: Recommendation) => {
            const slots = [
              r.primary,
              ...(h >= 3 ? r.alternates.slice(0, 2) : []),
            ].flatMap((s) => (s ? [s] : []))
            return (
              <ul className="flex flex-col gap-1">
                {slots.map((s, i) => {
                  const id = parseMatchKey(s.matchKey)
                  return (
                    <li
                      key={`${s.matchKey}|${s.teamNumber}`}
                      className="relative"
                    >
                      {renderLink({
                        href: scoutHref(s),
                        className:
                          i === 0
                            ? "text-headline after:absolute after:inset-0"
                            : "text-subhead after:absolute after:inset-0",
                        children: `Scout ${s.teamNumber} · ${id ? shortMatchLabel(id) : ""} · ${stationLabel(s.station)}`,
                      })}
                      {i === 0 ? (
                        <p className="text-footnote text-muted-foreground">
                          {reasonText(s.reason, s.teamNumber)}
                        </p>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )
          }}
        </DataView.Success>
      </DataView>
    </WidgetCard>
  )
}

export function ResumeDraftsWidget({ eventKey, h }: WidgetProps) {
  const drafts = useMyDrafts(eventKey)
  const renderLink = use(ListLinkContext)
  return (
    <WidgetCard title="Resume Drafts" href="/scouting/mine?show=drafts">
      <DataView state={drafts} size="inline">
        <DataView.Empty
          icon={ClipboardList}
          title="No drafts. You’re all caught up."
        />
        <DataView.Error title="Couldn’t load drafts." />
        <DataView.Success>
          {(
            list: ReturnType<typeof useMyDrafts> extends DataState<infer T>
              ? T
              : never
          ) => (
            <ul className="flex flex-col gap-1 text-subhead">
              {list.slice(0, Math.max(1, Math.floor(h * 1.5))).map((d) => {
                const id = d.matchKey ? parseMatchKey(d.matchKey) : null
                const label =
                  d.kind === "match"
                    ? `${id ? shortMatchLabel(id) : "Match"} · ${d.teamNumber ?? ""}`
                    : `${d.kind === "pit" ? "Pit" : "Post"} · ${d.teamNumber ?? ""}`
                const href =
                  d.kind === "match"
                    ? `/scouting/match/${d.matchKey ?? ""}/${d.teamNumber ?? ""}`
                    : `/scouting/${d.kind}/${d.teamNumber ?? ""}`
                return (
                  <li
                    key={d.id}
                    className="relative flex min-h-9 items-center justify-between"
                  >
                    {renderLink({
                      href,
                      className: "after:absolute after:inset-0",
                      children: label,
                    })}
                    <span className="text-footnote text-primary">Resume</span>
                  </li>
                )
              })}
            </ul>
          )}
        </DataView.Success>
      </DataView>
    </WidgetCard>
  )
}

interface Counts {
  mine: number
  matches: Array<{ key: string; scouted: number }>
}

function useCoverageCounts(eventKey: string): DataState<Counts> {
  const { db } = useDataRuntime()
  const me = useViewer()?.userId ?? ""
  const state = useCollectionState<Counts>({
    enabled: true,
    source: { scope: `event:${eventKey}`, entity: "scoutEntry" },
    deps: [eventKey, me],
    share: (c) => `${c.mine}:${c.matches.length}`,
    query: async () => {
      const [entries, matches] = await Promise.all([
        db.scoutEntries.where("eventKey").equals(eventKey).toArray(),
        db.matches.where("eventKey").equals(eventKey).toArray(),
      ])
      const played = matches
        .filter((m) => m.status === "played")
        .sort((a, b) => (b.scheduledTime ?? 0) - (a.scheduledTime ?? 0))
      if (played.length === 0) return []
      return [
        {
          mine: entries.filter((e) => e.authorId === me).length,
          matches: played.map((m) => ({
            key: m.key,
            scouted: new Set(
              entries.filter((e) => e.matchKey === m.key).map((e) => e.station)
            ).size,
          })),
        },
      ]
    },
  })
  return state.status === "success"
    ? state.data[0]
      ? { status: "success", data: state.data[0] }
      : { status: "empty" }
    : state
}

export function MyCoverageWidget({ eventKey, w, h }: WidgetProps) {
  const state = useCoverageCounts(eventKey)
  const small = w * h <= 2
  return (
    <WidgetCard title="My Coverage" href="/scouting/mine" compact={small}>
      <DataView state={state} size="inline">
        <DataView.Empty icon={ClipboardList} title="No matches played yet" />
        <DataView.Error title="Couldn’t count." />
        <DataView.Success>
          {(c: Counts) => (
            <p className="flex h-full flex-col justify-center">
              <span className="font-heading text-title-1 tabular-nums">
                {c.mine}
              </span>
              <span className="text-footnote text-muted-foreground">
                {c.mine === 1 ? "robot scouted" : "robots scouted"}
              </span>
            </p>
          )}
        </DataView.Success>
      </DataView>
    </WidgetCard>
  )
}

export function CoverageOverviewWidget({ eventKey, w }: WidgetProps) {
  const state = useCoverageCounts(eventKey)
  return (
    <WidgetCard title="Coverage Overview" href="/matches?status=played">
      <DataView state={state} size="inline">
        <DataView.Empty icon={ClipboardList} title="No matches played yet" />
        <DataView.Error title="Couldn’t load coverage." />
        <DataView.Success>
          {(c: Counts) => (
            <ul className="flex flex-col gap-1 text-subhead">
              {c.matches.slice(0, w >= 8 ? 8 : 4).map((m) => {
                const id = parseMatchKey(m.key)
                return (
                  <li key={m.key} className="flex justify-between">
                    <span>{id ? shortMatchLabel(id) : m.key}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {m.scouted} of 6 robots
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </DataView.Success>
      </DataView>
    </WidgetCard>
  )
}
