// Nav-bar actions on tab roots (ui-patterns §7.1). Leading, always first (owner): the notification
// bell (it replaced the sync pill, FX-15), then Send Feedback in testing builds (FX-32). Trailing,
// on Home: Help ("?", glossary-help.md §4) and Settings (profile).
import { Link } from "@tanstack/react-router"
import { useGlossary } from "@/components/glossary/glossary-provider"
import { CircleHelp, CircleUser } from "@/components/icons/icon"
import { FeedbackButton } from "@/features/feedback/components/feedback-sheet"
import { NotificationBell } from "@/features/notifications/components/notification-center"

export function TabRootLeading() {
  return (
    <div className="flex items-center gap-2">
      <NotificationBell />
      <FeedbackButton />
    </div>
  )
}

export function TabRootActions({ profile = false }: { profile?: boolean }) {
  const glossary = useGlossary()
  return (
    <div className="flex items-center gap-2">
      {profile && glossary ? (
        <button
          type="button"
          aria-label="Help"
          onClick={() => glossary.open("glossary")}
          className="hit-44 inline-flex size-9 items-center justify-center rounded-full glass-button text-primary transition-[scale] active:scale-90"
        >
          <CircleHelp aria-hidden size={20} />
        </button>
      ) : null}
      {profile ? (
        <Link
          to="/settings"
          aria-label="Settings"
          className="hit-44 inline-flex size-9 items-center justify-center rounded-full glass-button text-primary transition-[scale] active:scale-90"
        >
          <CircleUser aria-hidden size={22} />
        </Link>
      ) : null}
    </div>
  )
}
