// Phase 3 screens with fixed data (scaffold-plan §6.7): the match and team lists, a match, and the
// announcement feed, so axe, touch targets and AX3 cover them like the primitives.
import { useState } from "react"
import { activeGame } from "@/config/game"
import { MatchDetailView } from "@/features/matches/components/match-detail-view"
import { MatchListView } from "@/features/matches/components/match-list-view"
import { matchesSearch } from "@/features/matches/types/matches-search"
import { AnnouncementsView } from "@/features/messages/components/announcements-view"
import { TeamListView } from "@/features/teams/components/team-list-view"
import { teamsSearch } from "@/features/teams/types/teams-search"
import { resolveColumns } from "@/features/teams/utils/columns"
import { GallerySection } from "./gallery-section"
import { GALLERY_NOW, galleryMatches, galleryTeams } from "./screen-fixtures"

const coverage = new Map([
  ["2026demo_qm1", [2, 1, 1, 0, 1, 1] as const],
  ["2026demo_qm2", [1, 1, 1, 1, 1, 1] as const],
])

const [firstMatch] = galleryMatches

export function ScreensPage() {
  const [mSearch, setMSearch] = useState(() => matchesSearch.parse({}))
  const [tSearch, setTSearch] = useState(() => teamsSearch.parse({}))
  const [acked, setAcked] = useState<ReadonlySet<string>>(new Set())
  return (
    <>
      <GallerySection title="Matches">
        <MatchListView
          state={{ status: "success", data: galleryMatches }}
          coverage={coverage}
          context={{
            nicknames: new Map(),
            videos: new Set(),
            timeZone: "America/Los_Angeles",
          }}
          search={mSearch}
          onSearchChange={(p) => setMSearch((s) => ({ ...s, ...p }))}
          ourTeam={2276}
          watched={new Set([1678])}
          canScout
          now={GALLERY_NOW}
        />
      </GallerySection>
      <GallerySection title="Match">
        <MatchDetailView
          game={activeGame}
          entries={[]}
          metrics={undefined}
          state={
            firstMatch
              ? { status: "success", data: firstMatch }
              : { status: "empty" }
          }
          label="Qual 1"
          teams={new Map()}
          coverage={coverage.get("2026demo_qm1")}
          notes={{
            status: "success",
            data: [
              {
                id: "n1",
                body: "Fast cycles, struggled with defense.",
                authorName: "Sam",
                createdAt: GALLERY_NOW,
                private: false,
                syncState: "synced",
              },
            ],
          }}
          showCoverage
          ourTeam={2276}
          now={GALLERY_NOW}
        />
      </GallerySection>
      <GallerySection title="Teams">
        <TeamListView
          game={activeGame}
          state={{ status: "success", data: galleryTeams }}
          metrics={null}
          refreshing={false}
          coverageTarget={3}
          columns={resolveColumns(activeGame, undefined)}
          search={tSearch}
          onSearchChange={(p) => setTSearch((s) => ({ ...s, ...p }))}
          ourTeam={2276}
          watched={new Set([254])}
          canScout
        />
      </GallerySection>
      <GallerySection title="Announcements">
        <AnnouncementsView
          state={{
            status: "success",
            data: [
              {
                id: "a1",
                body: "Lunch until 1:15. Robots stay in the pit.",
                authorName: "Coach Kim",
                createdAt: GALLERY_NOW,
                urgent: true,
                syncState: "synced",
                reactions: [
                  {
                    emoji: "👍",
                    count: 3,
                    mineId: "r1",
                    names: ["You", "Sam", "Alex"],
                  },
                ],
              },
              {
                id: "a2",
                body: "Pit inspection is done.",
                authorName: "Coach Kim",
                createdAt: GALLERY_NOW - 3_600_000,
                urgent: false,
                syncState: "synced",
                reactions: [],
              },
            ],
          }}
          acked={acked}
          onAcknowledge={(id) => setAcked((s) => new Set([...s, id]))}
          onReact={() => undefined}
        />
      </GallerySection>
    </>
  )
}
