// Trailing nav-bar actions on tab roots (ui-patterns §7.1): the notification bell (it replaced the
// sync pill, FX-15), and on Home the help ("?", glossary-help.md §4) and profile buttons.
import { Link } from "@tanstack/react-router"
import { useGlossary } from "@/components/glossary/glossary-provider"
import { CircleHelp, CircleUser } from "@/components/icons/icon"
import { FeedbackButton } from "@/features/feedback/components/feedback-sheet"
import { NotificationBell } from "@/features/notifications/components/notification-center"

export function TabRootActions({ profile = false }: { profile?: boolean }) {
  const glossary = useGlossary()
  return (
    <>
      <FeedbackButton />
      <NotificationBell />
      {profile && glossary ? (
        <button
          type="button"
          aria-label="Help"
          onClick={() => glossary.open("glossary")}
          className="inline-flex size-11 items-center justify-center rounded-full text-primary"
        >
          <CircleHelp aria-hidden size={24} />
        </button>
      ) : null}
      {profile ? (
        <Link
          to="/settings"
          aria-label="Settings"
          className="inline-flex size-11 items-center justify-center rounded-full text-primary"
        >
          <CircleUser aria-hidden size={26} />
        </Link>
      ) : null}
    </>
  )
}
