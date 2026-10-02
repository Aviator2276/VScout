// Orders matches and flattens them with section headers and the Now divider into one array for the
// virtualizer (matches.md M1 "Sections and ordering").
import type { MatchesSort } from "../types/matches-search"
import { compareMatchIds } from "@/utils/match-label"
import type { MatchView } from "./match-view"
import { scoutedState } from "./match-view"

export type ListItem =
  | { kind: "header"; id: string; title: string }
  | { kind: "now"; id: "now"; title: string }
  | {
      kind: "row"
      id: string
      match: MatchView
      upNext: boolean
      /** 1-based position among rows (aria-posinset) */
      position: number
    }

export interface SectionedMatches {
  items: Array<ListItem>
  rowCount: number
  /** index in items of the Up next row, or -1 */
  upNextIndex: number
  /** index of the Now divider, or -1 */
  nowIndex: number
}

export function scheduleOrder(a: MatchView, b: MatchView): number {
  return compareMatchIds(a, b)
}

/** The first match that hasn't started: not played and not on the field (matches.md criterion 1). */
export function nextMatch(
  matches: ReadonlyArray<MatchView>
): MatchView | undefined {
  return [...matches].sort(scheduleOrder).find((m) => !m.played && !m.onField)
}

function dayName(time: number | null, timeZone: string): string | null {
  if (time === null) return null
  try {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      timeZone,
    }).format(time)
  } catch {
    return new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(time)
  }
}

function sectionTitle(m: MatchView, timeZone: string): string {
  if (m.compLevel !== "qm") return "Playoffs"
  const day = dayName(m.time, timeZone)
  return day ? `Qualifications · ${day}` : "Qualifications"
}

export function sortAndSection(
  matches: ReadonlyArray<MatchView>,
  sort: MatchesSort,
  opts: { timeZone: string; upNextKey: string | null }
): SectionedMatches {
  const items: Array<ListItem> = []
  let position = 0
  let upNextIndex = -1
  let nowIndex = -1
  const pushRow = (m: MatchView) => {
    const upNext = m.key === opts.upNextKey
    if (upNext) upNextIndex = items.length
    items.push({
      kind: "row",
      id: m.key,
      match: m,
      upNext,
      position: ++position,
    })
  }

  if (sort === "least-scouted") {
    const played = matches
      .filter((m) => m.played)
      .sort((a, b) => {
        const x = scoutedState(a.coverage)
        const y = scoutedState(b.coverage)
        return y.zero - x.zero || y.one - x.one || scheduleOrder(a, b)
      })
    if (played.length > 0)
      items.push({
        kind: "header",
        id: "h:least",
        title: "Least scouted first",
      })
    for (const m of played) pushRow(m)
    return { items, rowCount: position, upNextIndex, nowIndex }
  }

  const ordered = [...matches].sort(scheduleOrder)
  if (sort === "recent") ordered.reverse()

  let section: string | null = null
  let rows = 0
  for (const m of ordered) {
    const title = sectionTitle(m, opts.timeZone)
    if (title !== section) {
      section = title
      items.push({ kind: "header", id: `h:${title}`, title })
    }
    // right above the Up next match, once something has happened before it
    if (sort === "schedule" && m.key === opts.upNextKey && rows > 0) {
      nowIndex = items.length
      const onField = matches.find((x) => x.onField)
      items.push({
        kind: "now",
        id: "now",
        title: onField ? `Now · ${onField.longLabel} on field` : "Now",
      })
    }
    pushRow(m)
    rows++
  }
  return { items, rowCount: position, upNextIndex, nowIndex }
}
