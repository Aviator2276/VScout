import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { Button } from "@/components/controls/button"
import { TextField } from "@/components/form/text-field"
import { NavBackButton } from "@/components/layout/nav-back-button"
import { StackPage } from "@/components/layout/stack-page"
import { useToast } from "@/components/overlays/toaster"
import { useTeamNumber } from "@/features/admin/api/get-admin"
import { useAdminActions } from "@/lib/db/react/data-runtime"

export const Route = createFileRoute(
  "/_authed/_event/_tabs/settings/admin/team"
)({
  component: TeamNumber,
})

// AD3a: the team's own number, set once for everyone (teamSettings, R2-14).
function TeamNumber() {
  const current = useTeamNumber()
  const admin = useAdminActions()
  const toast = useToast()
  const [draft, setDraft] = useState<string | null>(null)
  const value = draft ?? (current ? String(current) : "")
  const n = Number(value)
  const valid = value === "" || (Number.isInteger(n) && n > 0 && n < 100_000)
  return (
    <StackPage
      title="Team Number"
      leading={<NavBackButton parentHref="/settings/admin" label="Admin" />}
    >
      <form
        className="mt-4 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (!valid) return
          void admin.setTeamNumber(value === "" ? null : n).then(() => {
            setDraft(null)
            toast.show({
              title:
                value === ""
                  ? "Team number cleared"
                  : `Team number set to ${n}`,
            })
          })
        }}
      >
        <TextField
          label="Our team number"
          inputMode="numeric"
          value={value}
          onValueChange={(v) => setDraft(v.replace(/\D/g, "").slice(0, 5))}
          description={
            current === null
              ? "No team number yet. Everyone on the team sees matches for this team."
              : "Everyone on the team sees matches for this team."
          }
          {...(valid ? {} : { errors: ["Enter a team number."] })}
        />
        <Button type="submit" size="large" disabled={draft === null || !valid}>
          Save
        </Button>
      </form>
    </StackPage>
  )
}
