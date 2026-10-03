import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { z } from "zod"
import { Button } from "@/components/controls/button"
import { ChoiceChips } from "@/components/controls/choice-chips"
import { DataView } from "@/components/data-view/data-view"
import { SearchField } from "@/components/form/search-field"
import { TextField } from "@/components/form/text-field"
import { Plus, UsersRound } from "@/components/icons/icon"
import { NavBackButton } from "@/components/layout/nav-back-button"
import { StackPage } from "@/components/layout/stack-page"
import { List } from "@/components/list/list"
import { Sheet } from "@/components/overlays/sheet"
import { useToast } from "@/components/overlays/toaster"
import { useUsers } from "@/features/admin/api/get-admin"
import { useOnline } from "@/hooks/use-online"
import { useAdminActions } from "@/lib/db/react/data-runtime"
import type { UserRecord } from "@/lib/db/types"

export const Route = createFileRoute(
  "/_authed/_event/_tabs/settings/admin/users/"
)({
  validateSearch: z.object({
    q: z.string().max(60).optional().catch(undefined),
    role: z.enum(["admin", "scouter"]).optional().catch(undefined),
    sheet: z.enum(["new"]).optional().catch(undefined),
  }),
  component: Users,
})

const ROLE = { admin: "Admin", scouter: "Scouter", guest: "Guest" }

// AD2: accounts, filtered by role and name. New accounts get a passphrase shown once.
function Users() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const online = useOnline()
  const state = useUsers(online)
  const q = (search.q ?? "").trim().toLowerCase()
  const shown =
    state.status === "success"
      ? (() => {
          const data = state.data.filter(
            (u) =>
              u.role !== "guest" &&
              (!search.role || u.role === search.role) &&
              (!q ||
                u.displayName.toLowerCase().includes(q) ||
                u.username.toLowerCase().includes(q))
          )
          return data.length === 0
            ? ({ status: "empty" } as const)
            : { ...state, data }
        })()
      : state
  return (
    <StackPage
      title="Users & Roles"
      leading={<NavBackButton parentHref="/settings/admin" label="Admin" />}
      trailing={
        <button
          type="button"
          aria-label="New User"
          disabled={!online}
          onClick={() =>
            void navigate({ search: (p) => ({ ...p, sheet: "new" }) })
          }
          className="inline-flex size-11 items-center justify-center rounded-full text-primary disabled:opacity-40"
        >
          <Plus aria-hidden size={24} />
        </button>
      }
    >
      <SearchField
        label="Search users"
        landmark="Users"
        placeholder="Search"
        value={search.q ?? ""}
        onValueChange={(v) =>
          void navigate({
            search: (p) => ({ ...p, q: v || undefined }),
            replace: true,
          })
        }
      />
      <ChoiceChips
        label="Role"
        options={[
          { value: "all", label: "All" },
          { value: "admin", label: "Admins" },
          { value: "scouter", label: "Scouters" },
        ]}
        value={search.role ?? "all"}
        onValueChange={(v) =>
          void navigate({
            search: (p) => ({ ...p, role: v === "all" ? undefined : v }),
            replace: true,
          })
        }
      />
      <DataView state={shown} size="page">
        <DataView.Empty
          icon={UsersRound}
          title={
            q || search.role ? "No users match" : "No users yet. Add your team."
          }
        />
        <DataView.Error title="Couldn’t load users." />
        <DataView.Success>
          {(list: ReadonlyArray<UserRecord>) => (
            <List.Section>
              {list.map((u) => (
                <List.Row
                  key={u.id}
                  title={u.displayName}
                  subtitle={`@${u.username}${u.active ? "" : " · Deactivated"}`}
                  detail={ROLE[u.role]}
                  href={`/settings/admin/users/${u.id}`}
                />
              ))}
            </List.Section>
          )}
        </DataView.Success>
      </DataView>
      <NewUserSheet
        open={search.sheet === "new"}
        onClose={() =>
          void navigate({
            search: (p) => ({ ...p, sheet: undefined }),
            replace: true,
          })
        }
      />
    </StackPage>
  )
}

function NewUserSheet({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const admin = useAdminActions()
  const toast = useToast()
  const [name, setName] = useState("")
  const [username, setUsername] = useState("")
  const [role, setRole] = useState<"scouter" | "admin">("scouter")
  const [created, setCreated] = useState<{
    username: string
    passphrase: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const close = () => {
    setCreated(null)
    setName("")
    setUsername("")
    setError(null)
    onClose()
  }
  return (
    <Sheet open={open} onOpenChange={(o) => (o ? undefined : close())}>
      <Sheet.Content
        title={created ? "Account Created" : "New User"}
        detent="large"
        closeLabel="Done"
      >
        {created ? (
          <div className="flex flex-col gap-3">
            <p className="text-body">
              Give this passphrase to <strong>@{created.username}</strong>. It’s
              shown only once.
            </p>
            <p className="rounded-xl bg-muted px-4 py-3 text-center font-heading text-title-2 select-all">
              {created.passphrase}
            </p>
            <Button
              variant="secondary"
              onClick={() =>
                void navigator.clipboard
                  .writeText(created.passphrase)
                  .then(() => toast.show({ title: "Passphrase copied" }))
              }
            >
              Copy Passphrase
            </Button>
          </div>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              void admin
                .createUser({
                  username: username.trim(),
                  displayName: name.trim(),
                  role,
                })
                .then((r) => {
                  if (r.kind === "ok")
                    setCreated({
                      username: username.trim(),
                      passphrase: r.passphrase,
                    })
                  else
                    setError(
                      r.kind === "offline"
                        ? "You’re offline. Try again when connected."
                        : r.code === "username_taken"
                          ? "That username is taken."
                          : "Couldn’t create the account. Try again."
                    )
                })
            }}
          >
            <TextField
              label="Name"
              value={name}
              onValueChange={setName}
              autoComplete="off"
            />
            <TextField
              label="Username"
              value={username}
              onValueChange={(v) => {
                setUsername(v.toLowerCase().replace(/[^a-z0-9._-]/g, ""))
                setError(null)
              }}
              autoCapitalize="none"
              autoCorrect="off"
              {...(error ? { errors: [error] } : {})}
            />
            <ChoiceChips
              label="Role"
              options={[
                { value: "scouter", label: "Scouter" },
                { value: "admin", label: "Admin" },
              ]}
              value={role}
              onValueChange={setRole}
            />
            <Button
              type="submit"
              size="large"
              disabled={!name.trim() || username.length < 2}
            >
              Create Account
            </Button>
          </form>
        )}
      </Sheet.Content>
    </Sheet>
  )
}
