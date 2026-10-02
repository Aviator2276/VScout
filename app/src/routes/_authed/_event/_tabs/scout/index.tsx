import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { TabRootActions } from "@/app/tab-root-actions"
import { DataView } from "@/components/data-view/data-view"
import { StackPage } from "@/components/layout/stack-page"
import { List } from "@/components/list/list"
import { useAnnouncements } from "@/features/messages/api/get-announcements"
import { useConversations } from "@/features/messages/api/get-messages"
import {
  useMyDrafts,
  useRecommendation,
} from "@/features/scouting/api/get-recommendations"
import type { ResumeDraft } from "@/features/scouting/api/get-recommendations"
import { useScoutingSettings } from "@/features/scouting/api/get-scout-target"
import { NeedsScoutingCard } from "@/features/scouting/components/needs-scouting"
import { useNow } from "@/hooks/use-now"
import { useOurTeam } from "@/hooks/use-our-team"
import { useWatchedTeams } from "@/hooks/use-prefs"
import { can } from "@/lib/authorization"
import { parseMatchKey, shortMatchLabel } from "@/utils/match-label"

export const Route = createFileRoute("/_authed/_event/_tabs/scout/")({
  component: ScoutHome,
})

const ago = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })

function draftHref(d: ResumeDraft): string {
  if (d.kind === "match" && d.matchKey)
    return `/scouting/match/${d.matchKey}/${d.teamNumber ?? ""}`
  return `/scouting/${d.kind}/${d.teamNumber ?? ""}`
}

function draftTitle(d: ResumeDraft): string {
  const id = d.matchKey ? parseMatchKey(d.matchKey) : null
  if (d.kind === "match")
    return `${id ? shortMatchLabel(id) : "Match"} · ${d.teamNumber ?? ""}`
  return `${d.kind === "pit" ? "Pit" : "Post"} · ${d.teamNumber ?? ""}`
}

// The Scout tab home (scout-tab.md S0): what needs attention, one section each, so one failing
// section never blanks the screen.
function ScoutHome() {
  const { event, session } = Route.useRouteContext()
  const navigate = useNavigate()
  const canScout = can(session, "scouting:create")
  const ourTeam = useOurTeam()
  const { watched } = useWatchedTeams()
  const settings = useScoutingSettings(event.key)
  const rec = useRecommendation(event.key, { ourTeam, watched })
  const drafts = useMyDrafts(event.key)
  const announcements = useAnnouncements(event.key)
  const now = useNow()
  const conversations = useConversations(event.key)
  const unread =
    conversations.status === "success"
      ? conversations.data.reduce((n, c) => n + c.unread, 0)
      : 0
  const latest =
    announcements.status === "success" ? announcements.data[0] : undefined

  return (
    <StackPage title="Scout" trailing={<TabRootActions />}>
      {canScout ? (
        <section aria-labelledby="needs-scouting" className="mt-2">
          <h2
            id="needs-scouting"
            className="mb-1.5 px-4 text-footnote text-muted-foreground uppercase"
          >
            Needs Scouting
          </h2>
          <NeedsScoutingCard
            state={rec}
            closedForScouters={!settings.scoutingOpen}
            moreHref="/scout/needs-scouting"
            onStart={(s) =>
              void navigate({
                to: "/scouting/match/$matchKey/$teamNumber",
                params: {
                  matchKey: s.matchKey,
                  teamNumber: String(s.teamNumber),
                },
              })
            }
          />
        </section>
      ) : null}

      {canScout && drafts.status === "success" ? (
        <List.Section title="Resume">
          {drafts.data.slice(0, 3).map((d) => (
            <List.Row
              key={d.id}
              title={draftTitle(d)}
              detail={`Saved ${ago.format(Math.round((d.updatedAt - now) / 60_000), "minute")}`}
              href={draftHref(d)}
            />
          ))}
        </List.Section>
      ) : null}

      {canScout ? (
        <List.Section title="Your Scouting">
          <List.Row title="My Entries" href="/scouting/mine" />
        </List.Section>
      ) : null}

      <List.Section title="Plan">
        <List.Row
          title="Strategy"
          detail="Pre-match briefings"
          href="/scout/strategy"
        />
        <List.Row title="Alliance Selection" href="/scout/alliance-selection" />
        <List.Row title="Picklists" href="/scout/picklists" />
      </List.Section>

      {can(session, "message:read") ? (
        <List.Section title="Talk">
          <List.Row
            title="Messages"
            detail={unread > 0 ? `${unread} unread` : undefined}
            href="/scout/messages"
          />
        </List.Section>
      ) : null}

      {latest ? (
        <List.Section title="Announcements">
          <List.Row
            title={latest.urgent ? `Urgent: ${latest.body}` : latest.body}
            href="/scout/announcements"
          />
        </List.Section>
      ) : announcements.status === "error" ? (
        <DataView state={announcements} size="inline">
          <DataView.Error title="Couldn’t load announcements." />
        </DataView>
      ) : null}
    </StackPage>
  )
}
