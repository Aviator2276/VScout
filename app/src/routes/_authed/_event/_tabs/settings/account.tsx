import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { Button } from "@/components/controls/button"
import { TextField } from "@/components/form/text-field"
import { NavBackButton } from "@/components/layout/nav-back-button"
import { StackPage } from "@/components/layout/stack-page"
import { List } from "@/components/list/list"
import { ConfirmAlert } from "@/components/overlays/confirm-alert"
import { Sheet } from "@/components/overlays/sheet"
import { useToast } from "@/components/overlays/toaster"
import { useNow } from "@/hooks/use-now"
import { useOnline } from "@/hooks/use-online"
import { useOurTeam } from "@/hooks/use-our-team"
import { useSession } from "@/hooks/use-session"
import { useLiveActions } from "@/lib/db/react/data-runtime"

export const Route = createFileRoute("/_authed/_event/_tabs/settings/account")({
  component: Account,
})

const ROLE_LABEL = { admin: "Admin", scouter: "Scouter", guest: "Guest" }
const DAY = 86_400_000
const date = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
})

// Settings → Account (features/settings.md): who's signed in, until when, password, Sign Out.
function Account() {
  const { app } = Route.useRouteContext()
  const runtime = app()
  const session = useSession(runtime.auth)
  const ourTeam = useOurTeam()
  const online = useOnline()
  const navigate = useNavigate()
  const live = useLiveActions()
  const toast = useToast()
  const [pending, setPending] = useState(0)
  const [busy, setBusy] = useState(false)
  const [pw, setPw] = useState(false)
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [pwError, setPwError] = useState<string | null>(null)
  const guest = session?.role === "guest"
  const expires = session?.refreshExpiresAt ?? 0
  const now = useNow(60_000)
  const soon = expires - now < 2 * DAY

  const signOut = async (force: boolean) => {
    setBusy(true)
    const result = await runtime.signOut({ force })
    if (!result.ok) {
      setPending(result.pendingChanges)
      setBusy(false)
    }
  }

  return (
    <StackPage
      title="Account"
      leading={<NavBackButton parentHref="/settings" label="Settings" />}
    >
      <List.Section>
        <List.Row
          title="Name"
          detail={guest ? "Guest on this device" : (session?.displayName ?? "")}
        />
        <List.Row
          title="Role"
          detail={session ? ROLE_LABEL[session.role] : ""}
        />
        {guest ? null : (
          <List.Row title="Team" detail={ourTeam ?? "Not set yet"} />
        )}
      </List.Section>
      <List.Section
        title="Sign-in"
        footer="VScout keeps you signed in so you can scout offline. Signing in again extends that."
      >
        <List.Row
          title="Signed in until"
          detail={expires ? date.format(expires) : "—"}
        />
        {soon && !guest ? (
          <List.Row
            title="Sign In Again"
            onSelect={() =>
              void navigate({ to: "/login", search: { reauth: true } })
            }
          />
        ) : null}
        {guest ? null : (
          <List.Row
            title="Change Password"
            detail={online ? undefined : "Needs connection"}
            {...(online ? { onSelect: () => setPw(true) } : {})}
          />
        )}
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
        onOpenChange={(o) => {
          if (!o) setPending(0)
        }}
        title="Sign out anyway?"
        description={`${pending} ${pending === 1 ? "change hasn't" : "changes haven't"} synced. Signing out deletes ${pending === 1 ? "it" : "them"} from this device.`}
        confirmLabel="Sign Out"
        cancelLabel="Stay and Sync"
        tone="destructive"
        onConfirm={() => void signOut(true)}
      />
      <Sheet open={pw} onOpenChange={setPw}>
        <Sheet.Content title="Change Password">
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (next.length < 8) {
                setPwError("Use at least 8 characters.")
                return
              }
              void live.changePassword(current, next).then((r) => {
                if (r.kind === "ok") {
                  setPw(false)
                  setCurrent("")
                  setNext("")
                  toast.show({ title: "Password changed" })
                } else
                  setPwError(
                    r.kind === "offline"
                      ? "You’re offline. Try again when connected."
                      : r.code === "invalid_credentials"
                        ? "Your current password isn’t right."
                        : "Couldn’t change your password. Try again."
                  )
              })
            }}
          >
            <TextField
              label="Current password"
              type="password"
              autoComplete="current-password"
              value={current}
              onValueChange={setCurrent}
            />
            <TextField
              label="New password"
              type="password"
              autoComplete="new-password"
              value={next}
              onValueChange={(v) => {
                setNext(v)
                setPwError(null)
              }}
              {...(pwError ? { errors: [pwError] } : {})}
            />
            <Button type="submit" size="large" disabled={!current || !next}>
              Change Password
            </Button>
          </form>
        </Sheet.Content>
      </Sheet>
    </StackPage>
  )
}
