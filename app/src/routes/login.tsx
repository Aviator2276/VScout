import { createFileRoute, redirect, useRouter } from "@tanstack/react-router"
import { useEffect, useSyncExternalStore } from "react"
import { useGlossary } from "@/components/glossary/glossary-provider"
import { LoginScreen } from "@/features/auth/components/login-screen"
import { loginSearch } from "@/features/auth/types/login-search"
import { useOnline } from "@/hooks/use-online"
import { safeRedirect } from "@/utils/safe-redirect"

export const Route = createFileRoute("/login")({
  validateSearch: loginSearch,
  beforeLoad: async ({ context, search }) => {
    const session = await context.app().auth.ensureLoaded()
    if (session?.status === "active" && !search.reauth)
      throw redirect({ href: safeRedirect(search.redirect) })
  },
  loader: async ({ context }) => {
    // "Sign in again" keeps the same user: prefill their username
    const row = await context.app().db.session.get("current")
    return { username: row?.username ?? undefined }
  },
  component: LoginRoute,
})

function LoginRoute() {
  const { app } = Route.useRouteContext()
  const runtime = app()
  const glossary = useGlossary()
  const search = Route.useSearch()
  const { username } = Route.useLoaderData()
  const navigate = Route.useNavigate()
  const router = useRouter()
  const online = useOnline()
  const capabilities = useSyncExternalStore(
    runtime.capabilities.subscribe,
    runtime.capabilities.get,
    runtime.capabilities.get
  )

  useEffect(() => {
    void runtime.loadMeta()
  }, [runtime, online])

  const done = async () => {
    void runtime.afterSignIn()
    await router.invalidate()
    await router.navigate({ href: safeRedirect(search.redirect) })
  }

  return (
    <LoginScreen
      online={online}
      guestLogin={capabilities.guestLogin}
      guestOpen={search.guest === true}
      onGuestOpenChange={(open) =>
        void navigate({
          search: (prev) => ({ ...prev, guest: open || undefined }),
          replace: !open,
        })
      }
      defaultUsername={search.reauth ? username : undefined}
      endedReason={search.reason}
      onSignIn={async (u, p) => {
        await runtime.auth.login(u, p)
        await done()
      }}
      onHelp={() => glossary?.open("guides")}
      onJoinAsGuest={async (code) => {
        await runtime.auth.loginAsGuest(code)
        await done()
      }}
    />
  )
}
