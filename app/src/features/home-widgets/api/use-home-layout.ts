// The viewer's Home layout (features/home.md H6): userSettings.homeLayout (guests: device prefs),
// migrated and repaired on read; a newer version from another device is never overwritten.
import { useCallback, useMemo } from "react"
import { widgetMeta } from "@/config/widget-catalog"
import { alignLists, normalize } from "@/components/grid/grid-engine"
import type { Breakpoint, GridItem } from "@/components/grid/grid-engine"
import { homeLayoutSetting } from "@/lib/contracts/home-layout"
import type { HomeLayout } from "@/lib/contracts/home-layout"
import { usePrefs, useSetPrefs } from "@/hooks/use-prefs"
import { logger } from "@/lib/logger"

export type CustomLists = Partial<Record<Breakpoint, Array<GridItem>>>

export interface HomeLayoutState {
  active: HomeLayout["active"]
  custom: CustomLists
  /** stored by a newer app version: show Starter, don't edit */
  newer: boolean
  /** the tip about Layout and Edit Home was dismissed */
  tipDismissed: boolean
}

const STARTER: HomeLayout["active"] = {
  kind: "template",
  templateId: "starter",
}

export function useHomeLayout(): HomeLayoutState {
  const prefs = usePrefs()
  const raw = prefs.homeLayout
  const tipDismissed = prefs.dismissedTips.includes("home.layoutTip")
  return useMemo(() => {
    if (raw === undefined || raw === null)
      return { active: STARTER, custom: {}, newer: false, tipDismissed }
    const parsed = homeLayoutSetting.safeParse(raw)
    if (!parsed.success) {
      const v = (raw as { v?: unknown }).v
      logger.warn("home", "homeLayout not readable", { v: String(v) })
      return {
        active: STARTER,
        custom: {},
        newer: typeof v === "number" && v > 2,
        tipDismissed,
      }
    }
    const meta = (w: string) => widgetMeta(w)
    const custom: CustomLists = {}
    for (const bp of ["compact", "regular", "wide"] as const) {
      const list = parsed.data.custom[bp]
      if (list) custom[bp] = normalize(list, meta)
    }
    return {
      active: parsed.data.active,
      custom: alignLists(custom),
      newer: false,
      tipDismissed,
    }
  }, [raw, tipDismissed])
}

export function useSaveHomeLayout() {
  const setPrefs = useSetPrefs()
  const prefs = usePrefs()
  const save = useCallback(
    (active: HomeLayout["active"], custom: CustomLists) =>
      setPrefs({ homeLayout: { v: 2, active, custom } }),
    [setPrefs]
  )
  const dismissTip = useCallback(
    () =>
      setPrefs({
        dismissedTips: [...new Set([...prefs.dismissedTips, "home.layoutTip"])],
      }),
    [setPrefs, prefs.dismissedTips]
  )
  return { save, dismissTip }
}
