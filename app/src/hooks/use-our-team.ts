// Our team number (teamSettings, admin-set, R2-14), or null until an admin sets it.
import { useDataRuntime } from "@/lib/db/react/data-runtime"
import { useLiveOr } from "@/lib/db/react/data-state-hooks"

export function useOurTeam(): number | null {
  const { db } = useDataRuntime()
  return useLiveOr(
    async () => (await db.teamSettings.get("team"))?.teamNumber ?? null,
    [],
    null
  )
}
