// Trailing nav-bar actions on tab roots (ui-patterns §7.1): the sync pill, and on Home the
// profile button into Settings.
import { Link } from "@tanstack/react-router"
import { CircleUser } from "@/components/icons/icon"
import { SyncStatusButton } from "@/features/sync-status/components/sync-status-button"

export function TabRootActions({ profile = false }: { profile?: boolean }) {
  return (
    <>
      <SyncStatusButton />
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
