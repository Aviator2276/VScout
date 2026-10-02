// Applies the theme and solid surfaces from settings (features/settings.md "Theme"): the synced
// theme (guests: device prefs) and this device's solid-surfaces switch, mirrored for the pre-paint
// script, re-applied when the system appearance changes. Also feeds the haptics switch.
import { useEffect } from "react"
import { useDeviceSettings } from "@/hooks/use-device-settings"
import { usePrefs } from "@/hooks/use-prefs"
import { configureHaptics } from "@/lib/haptics"
import { applyTheme, rememberTheme } from "@/lib/theme"

export function useAppearance() {
  const { theme } = usePrefs()
  const device = useDeviceSettings()
  const solid = device.solidSurfaces
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)")
    const apply = () =>
      applyTheme(document, {
        preference: theme,
        systemDark: mq.matches,
        solidSurfaces: solid,
      })
    apply()
    rememberTheme(localStorage, theme, solid)
    mq.addEventListener("change", apply)
    return () => mq.removeEventListener("change", apply)
  }, [theme, solid])
  useEffect(() => {
    configureHaptics({
      enabled: device.haptics,
      iosExperiment: device.iosHapticsExperiment,
    })
  }, [device.haptics, device.iosHapticsExperiment])
}
