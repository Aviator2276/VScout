// Trailing nav-bar actions on tab roots (ui-patterns §7.1): the sync pill, and on Home the
// help ("?", glossary-help.md §4) and profile buttons.
import { Link } from "@tanstack/react-router"
import { useGlossary } from "@/components/glossary/glossary-provider"
import { CircleHelp, CircleUser } from "@/components/icons/icon"
import { SyncStatusButton } from "@/features/sync-status/components/sync-status-button"

export function TabRootActions({ profile = false }: { profile?: boolean }) {
  const glossary = useGlossary()
  return (
    <>
      <SyncStatusButton />
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
