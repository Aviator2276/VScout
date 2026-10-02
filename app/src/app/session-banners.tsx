// Offline, "sign in again" and expiry banners (routing-auth §5.1, ADR-035), shown under every
// page's nav bar while signed in.
import { useRouterState } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { LogIn, TriangleAlert } from "@/components/icons/icon"
import { OfflineBanner } from "@/components/layout/offline-banner"
import { useSession } from "@/hooks/use-session"
import { expiryState } from "@/lib/auth/auth-client"
import type { AuthClient } from "@/lib/auth/auth-client"
import { AppUpdateBanner } from "./update-runtime"

const HOUR = 3_600_000

/** re-evaluates the expiry once a minute (render stays pure) */
function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])
  return now
}

export function SessionBanners({ auth }: { auth: AuthClient }) {
  const session = useSession(auth)
  const now = useMinuteClock()
  const href = useRouterState({ select: (s) => s.location.href })
  const signInAgain = `/login?reauth=true&redirect=${encodeURIComponent(href)}`
  const expiry = expiryState(session, now)
  const hoursLeft = session
    ? Math.max(1, Math.round((session.refreshExpiresAt - now) / HOUR))
    : 0

  let notice = null
  if (session?.status === "needs-reauth")
    notice = (
      <Notice href={signInAgain} icon="login">
        Sign in again to sync your changes. Your work is saved on this device.
      </Notice>
    )
  else if (expiry === "warn" || expiry === "urgent")
    notice = (
      <Notice href={signInAgain} icon="warn">
        Your sign-in expires in {hoursLeft} {hoursLeft === 1 ? "hour" : "hours"}
        . Sign in again to keep syncing.
      </Notice>
    )

  return (
    <>
      <OfflineBanner />
      {notice}
      <AppUpdateBanner />
    </>
  )
}

function Notice({
  href,
  icon,
  children,
}: {
  href: string
  icon: "login" | "warn"
  children: React.ReactNode
}) {
  const Icon = icon === "login" ? LogIn : TriangleAlert
  return (
    <a
      href={href}
      role="status"
      className="mt-2 mx-safe-4 flex min-h-11 items-center gap-2 rounded-xl bg-warning/15 px-3 py-2 text-footnote"
    >
      <Icon aria-hidden size={16} className="shrink-0 text-warning" />
      <span>{children}</span>
    </a>
  )
}
