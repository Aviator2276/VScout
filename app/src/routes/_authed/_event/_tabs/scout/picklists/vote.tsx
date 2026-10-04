import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { NavBackButton } from "@/components/layout/nav-back-button"
import { StackPage } from "@/components/layout/stack-page"
import { useToast } from "@/components/overlays/toaster"
import { usePicklistWrites } from "@/features/picklists/api/get-picklists"
import { useVote } from "@/features/picklists/api/get-vote"
import { VoteView } from "@/features/picklists/components/vote-view"
import { can } from "@/lib/authorization"

export const Route = createFileRoute(
  "/_authed/_event/_tabs/scout/picklists/vote"
)({
  validateSearch: z.object({
    purpose: z.enum(["first", "second"]).optional().catch(undefined),
  }),
  component: Vote,
})

const MASTER_NAME = { first: "Master First Pick", second: "Master Second Pick" }

function Vote() {
  const { event, session } = Route.useRouteContext()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const toast = useToast()
  const purpose = search.purpose ?? "first"
  const data = useVote(event.key, purpose)
  const writes = usePicklistWrites(event.key)
  const canBuild = can(session, "picklist:master")
  return (
    <StackPage
      title="Picklist Vote"
      leading={
        <NavBackButton parentHref="/scout/picklists" label="Picklists" />
      }
    >
      <VoteView
        purpose={purpose}
        onPurposeChange={(p) =>
          void navigate({
            search: { purpose: p === "first" ? undefined : p },
            replace: true,
          })
        }
        data={data}
        canVote={can(session, "picklist:create")}
        canBuild={canBuild}
        onVote={(listId) =>
          void writes
            .setBallot(purpose, listId)
            .catch(() =>
              toast.show({ title: "Couldn’t save your vote. Try again." })
            )
        }
        onAdd={(teams) => {
          const master = data?.master
          void (
            master
              ? writes.addTeams(
                  master.id,
                  master.rows.at(-1)?.rank ?? null,
                  teams
                )
              : writes.create({
                  name: MASTER_NAME[purpose],
                  purpose,
                  master: true,
                  teams,
                })
          ).then(
            () =>
              toast.show({
                title:
                  teams.length === 1
                    ? `Added ${teams[0]} to ${master?.name ?? MASTER_NAME[purpose]}`
                    : `Added ${teams.length} teams to ${master?.name ?? MASTER_NAME[purpose]}`,
              }),
            () =>
              toast.show({
                title: "Couldn’t add to the master list. Try again.",
              })
          )
        }}
      />
    </StackPage>
  )
}
