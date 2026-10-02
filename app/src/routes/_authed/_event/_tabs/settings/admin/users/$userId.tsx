import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { Segmented } from "@/components/controls/segmented"
import { DataView } from "@/components/data-view/data-view"
import { NavBackButton } from "@/components/layout/nav-back-button"
import { StackPage } from "@/components/layout/stack-page"
import { List } from "@/components/list/list"
import { ConfirmAlert } from "@/components/overlays/confirm-alert"
import { useToast } from "@/components/overlays/toaster"
import { useUser } from "@/features/admin/api/get-admin"
import { useOnline } from "@/hooks/use-online"
import { useAdminActions } from "@/lib/db/react/data-runtime"
import type { OnlineResult } from "@/lib/sync/live-actions"
import type { UserRecord } from "@/lib/db/types"

export const Route = createFileRoute(
  "/_authed/_event/_tabs/settings/admin/users/$userId"
)({
  component: UserDetail,
})

// AD2 detail: role, scouter level, deactivate, sign out everywhere. All online only.
function UserDetail() {
  const { userId } = Route.useParams()
  const state = useUser(userId)
  const admin = useAdminActions()
  const online = useOnline()
  const toast = useToast()
  const [confirm, setConfirm] = useState<"deactivate" | "revoke" | null>(null)
  const report = (r: OnlineResult, done: string) =>
    toast.show({
      title:
        r.kind === "ok"
          ? done
          : r.kind === "offline"
            ? "You’re offline. Try again when connected."
            : r.code === "last_admin"
              ? "At least one admin is required."
              : "Couldn’t save. Try again.",
    })
  return (
    <StackPage
      title={state.status === "success" ? state.data.displayName : "User"}
      leading={
        <NavBackButton parentHref="/settings/admin/users" label="Users" />
      }
    >
      <DataView state={state} size="page">
        <DataView.Missing not-found={{ title: "This user no longer exists" }} />
        <DataView.Error title="Couldn’t load this user." />
        <DataView.Success>
          {(u: UserRecord) => (
            <>
              <List.Section>
                <List.Row title="Username" detail={`@${u.username}`} />
                <List.Row
                  title="Status"
                  detail={u.active ? "Active" : "Deactivated"}
                />
              </List.Section>
              <section className="mt-4 flex flex-col gap-2">
                <h2 className="px-4 text-footnote text-muted-foreground uppercase">
                  Role
                </h2>
                <Segmented
                  label="Role"
                  value={u.role === "admin" ? "admin" : "scouter"}
                  onValueChange={(role) =>
                    void admin
                      .patchUser(u.id, { role })
                      .then((r) => report(r, "Role changed"))
                  }
                  options={[
                    { value: "scouter", label: "Scouter" },
                    { value: "admin", label: "Admin" },
                  ]}
                />
                <h2 className="mt-2 px-4 text-footnote text-muted-foreground uppercase">
                  Scouter level
                </h2>
                <Segmented
                  label="Scouter level"
                  value={
                    (u as UserRecord & { scouterLevel?: "new" | "experienced" })
                      .scouterLevel ?? "new"
                  }
                  onValueChange={(scouterLevel) =>
                    void admin
                      .patchUser(u.id, { scouterLevel })
                      .then((r) => report(r, "Level changed"))
                  }
                  options={[
                    { value: "new", label: "New" },
                    { value: "experienced", label: "Experienced" },
                  ]}
                />
                {online ? null : (
                  <p className="px-4 text-footnote text-muted-foreground">
                    Needs connection
                  </p>
                )}
              </section>
              <List.Section>
                <List.Row
                  title="Sign Out Everywhere"
                  {...(online
                    ? { onSelect: () => setConfirm("revoke") }
                    : { detail: "Needs connection" })}
                />
                <List.Row
                  title={
                    <span className="text-destructive">
                      {u.active ? "Deactivate" : "Reactivate"}
                    </span>
                  }
                  {...(online
                    ? {
                        onSelect: () =>
                          u.active
                            ? setConfirm("deactivate")
                            : void admin
                                .patchUser(u.id, { active: true })
                                .then((r) => report(r, "Reactivated")),
                      }
                    : { detail: "Needs connection" })}
                />
              </List.Section>
              <ConfirmAlert
                open={confirm === "deactivate"}
                onOpenChange={(o) => (o ? undefined : setConfirm(null))}
                title={`Deactivate ${u.displayName}?`}
                description="They’re signed out on every device and can’t sign in until you reactivate them. Their entries stay."
                confirmLabel="Deactivate"
                tone="destructive"
                onConfirm={() =>
                  void admin
                    .patchUser(u.id, { active: false })
                    .then((r) => report(r, "Deactivated"))
                }
              />
              <ConfirmAlert
                open={confirm === "revoke"}
                onOpenChange={(o) => (o ? undefined : setConfirm(null))}
                title="Sign Out Everywhere?"
                description={`${u.displayName} is signed out on every device and has to sign in again.`}
                confirmLabel="Sign Out"
                tone="destructive"
                onConfirm={() =>
                  void admin
                    .revokeSessions(u.id)
                    .then((r) => report(r, "Signed out everywhere"))
                }
              />
            </>
          )}
        </DataView.Success>
      </DataView>
    </StackPage>
  )
}
