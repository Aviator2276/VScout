import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { Button } from "@/components/controls/button"
import { NavBackButton } from "@/components/layout/nav-back-button"
import { StackPage } from "@/components/layout/stack-page"
import { List } from "@/components/list/list"
import { ConfirmAlert } from "@/components/overlays/confirm-alert"
import { APP_VERSION } from "@/config/version"
import { useSession } from "@/hooks/use-session"

export const Route = createFileRoute("/_authed/_event/_tabs/settings/")({
  component: Settings,
})

const ROLE_LABEL = { admin: "Admin", scouter: "Scouter", guest: "Guest" }

// The full Settings list (features/settings.md S0) is Phase 6; this is the shell's part.
function Settings() {
  const { app, event } = Route.useRouteContext()
  const runtime = app()
  const session = useSession(runtime.auth)
  const [pending, setPending] = useState(0)
  const [busy, setBusy] = useState(false)

  const signOut = async (force: boolean) => {
    setBusy(true)
    const result = await runtime.auth.logout({ force })
    if (!result.ok) {
      setPending(result.pendingChanges)
      setBusy(false)
    }
  }

  return (
    <StackPage
      title="Settings"
      leading={<NavBackButton parentHref="/" label="Home" />}
    >
      <List.Section title="Account">
        <List.Row
          title={session?.displayName ?? "Signed in"}
          detail={session ? ROLE_LABEL[session.role] : undefined}
        />
      </List.Section>
      <List.Section title="Event">
        <List.Row title="Event" detail={event.name} href="/settings/event" />
      </List.Section>
      <List.Section title="About">
        <List.Row title="Version" detail={APP_VERSION} />
      </List.Section>
      <Button
        variant="destructive"
        size="large"
        className="mt-6"
        disabled={busy}
        onClick={() => void signOut(false)}
      >
        Sign Out
      </Button>
      <ConfirmAlert
        open={pending > 0}
        onOpenChange={(open) => {
          if (!open) setPending(0)
        }}
        title="Sign out anyway?"
        description={`${pending} ${pending === 1 ? "change hasn't" : "changes haven't"} synced. Signing out deletes ${pending === 1 ? "it" : "them"} from this device.`}
        confirmLabel="Sign Out"
        cancelLabel="Stay and Sync"
        tone="destructive"
        onConfirm={() => void signOut(true)}
      />
    </StackPage>
  )
}
