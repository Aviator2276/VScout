// The sign-in screen (routing-auth §5.4): logo, account form, and "Continue as Guest" when the
// backend supports it (capabilities.guestLogin, ADR-071).
import { Logo } from "@/components/icons/logo"
import { endedMessage } from "../utils/login-messages"
import { GuestLogin } from "./guest-login"
import { LoginForm } from "./login-form"

export interface LoginScreenProps {
  online: boolean
  guestLogin: boolean
  guestOpen: boolean
  onGuestOpenChange: (open: boolean) => void
  defaultUsername?: string
  endedReason?: string | undefined
  onSignIn: (username: string, password: string) => Promise<void>
  onJoinAsGuest: (code: string) => Promise<void>
  /** "Need help?" opens the guides (glossary-help.md §4), offline too */
  onHelp?: () => void
}

export function LoginScreen(p: LoginScreenProps) {
  const ended = endedMessage(p.endedReason)
  return (
    <main className="py-safe mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-safe-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <Logo size="xl" decorative />
        <h1 className="font-heading text-large-title">VScout</h1>
        <p className="text-subhead text-muted-foreground">
          Sign in to scout with your team.
        </p>
      </div>
      {ended ? (
        <p
          role="status"
          className="rounded-xl bg-muted px-3 py-2 text-center text-footnote"
        >
          {ended}
        </p>
      ) : null}
      {p.guestOpen ? null : (
        <LoginForm
          online={p.online}
          onSignIn={p.onSignIn}
          {...(p.defaultUsername ? { defaultUsername: p.defaultUsername } : {})}
        />
      )}
      {p.guestLogin ? (
        <GuestLogin
          online={p.online}
          open={p.guestOpen}
          onOpenChange={p.onGuestOpenChange}
          onJoin={p.onJoinAsGuest}
        />
      ) : null}
      {p.onHelp ? (
        <button
          type="button"
          onClick={p.onHelp}
          className="mx-auto min-h-11 text-body text-primary"
        >
          Need help?
        </button>
      ) : null}
    </main>
  )
}
