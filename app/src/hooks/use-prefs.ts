// The viewer's preferences (ADR-033, ADR-066): the synced userSettings document for scouters and
// admins, deviceSettings.guestPrefs for guests, over the defaults. Writes go to the same place.
import { useCallback, useMemo } from "react"
import type { UserSettingsDocument } from "@/lib/contracts/user-settings"
import {
  useDataRuntime,
  useViewer,
  useWriter,
} from "@/lib/db/react/data-runtime"
import { useLiveOr } from "@/lib/db/react/data-state-hooks"
import {
  patchGuestPrefs,
  patchUserSettings,
  settingsDocument,
} from "@/lib/sync/settings-writes"
import type { SettingsPatch } from "@/lib/sync/settings-writes"

const DEFAULTS = settingsDocument(undefined)

export function usePrefs(): UserSettingsDocument {
  const { db } = useDataRuntime()
  const viewer = useViewer()
  const userId = viewer?.userId ?? null
  const guest = viewer?.role === "guest"
  return useLiveOr(
    async () => {
      if (!userId) return DEFAULTS
      const source = guest
        ? (await db.deviceSettings.get("device"))?.guestPrefs
        : await db.userSettings.get(userId)
      return settingsDocument(source)
    },
    [userId, guest],
    DEFAULTS
  )
}

export function useSetPrefs(): (patch: SettingsPatch) => Promise<void> {
  const viewer = useViewer()
  const writer = useWriter()
  const guest = viewer?.role === "guest"
  return useCallback(
    (patch: SettingsPatch) =>
      guest
        ? patchGuestPrefs(writer.db, patch)
        : patchUserSettings(writer, patch),
    [guest, writer]
  )
}

/** Watched teams as a set, and a toggle (Teams detail star, row menus). */
export function useWatchedTeams(): {
  watched: ReadonlySet<number>
  toggle: (team: number) => Promise<void>
} {
  const prefs = usePrefs()
  const setPrefs = useSetPrefs()
  const list = prefs.watchedTeams
  const toggle = useCallback(
    (team: number) =>
      setPrefs({
        watchedTeams: list.includes(team)
          ? list.filter((t) => t !== team)
          : [...list, team],
      }),
    [list, setPrefs]
  )
  const watched = useMemo(() => new Set(list), [list])
  return { watched, toggle }
}
