import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { DataView } from "@/components/data-view/data-view"
import { MessageSquare } from "@/components/icons/icon"
import { NavBackButton } from "@/components/layout/nav-back-button"
import { StackPage } from "@/components/layout/stack-page"
import { NoteComposer } from "@/components/notes/note-composer"
import { NoteList } from "@/components/notes/note-list"
import { activeGame } from "@/config/game"
import { useBriefing } from "@/features/strategy/api/get-briefing"
import { BriefingView } from "@/features/strategy/components/briefing-view"
import { useEventTeamMetrics } from "@/hooks/use-event-team-metrics"
import { useAddNote, useNotes } from "@/hooks/use-notes"
import { useOurTeam } from "@/hooks/use-our-team"
import { can } from "@/lib/authorization"
import { longMatchLabel, parseMatchKey } from "@/utils/match-label"

export const Route = createFileRoute(
  "/_authed/_event/_tabs/scout/strategy/$matchKey"
)({
  validateSearch: z.object({
    focus: z.coerce.number().int().optional().catch(undefined),
  }),
  component: BriefingRoute,
})

function BriefingRoute() {
  const { matchKey } = Route.useParams()
  const { event, session } = Route.useRouteContext()
  const ourTeam = useOurTeam()
  const id = parseMatchKey(matchKey)
  const label = id ? longMatchLabel(id) : "Match"
  const state = useBriefing(event.key, matchKey, ourTeam)
  const metrics = useEventTeamMetrics(event.key, "all")
  const notes = useNotes({ eventKey: event.key, matchKey })
  const add = useAddNote(event.key)
  return (
    <StackPage
      title={`${label} Strategy`}
      titleMode="inline"
      leading={<NavBackButton parentHref="/scout/strategy" label="Strategy" />}
    >
      <BriefingView
        game={activeGame}
        state={state}
        label={label}
        metrics={metrics.byTeam}
        notes={
          <section
            aria-labelledby="plan-notes"
            className="mt-2 flex flex-col gap-2"
          >
            <h2
              id="plan-notes"
              className="px-1 text-footnote text-muted-foreground uppercase"
            >
              Plan notes
            </h2>
            {can(session, "comment:create") && ourTeam !== null ? (
              <NoteComposer
                label="Add to the plan"
                allowPrivate
                onAdd={(n) => add({ teamNumber: ourTeam, matchKey, ...n })}
              />
            ) : null}
            <DataView state={notes}>
              <DataView.Empty icon={MessageSquare} title="No plan notes yet" />
              <DataView.Error title="Couldn’t load notes." />
              <DataView.Success>
                {(
                  list: ReadonlyArray<
                    Parameters<typeof NoteList>[0]["notes"][number]
                  >
                ) => <NoteList notes={list} />}
              </DataView.Success>
            </DataView>
          </section>
        }
      />
    </StackPage>
  )
}
