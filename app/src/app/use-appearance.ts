// Applies the theme and solid surfaces from settings (features/settings.md "Theme"): the synced
// theme (guests: device prefs) and this device's solid-surfaces switch, mirrored for the pre-paint
// script, re-applied when the system appearance changes. The chosen background is mirrored too, so
// the launch splash shows it. Also feeds the haptics switch.
import { useEffect } from "react"
import { appBackground } from "@/config/app-backgrounds"
import { useDeviceSettings } from "@/hooks/use-device-settings"
import { usePrefs } from "@/hooks/use-prefs"
import { configureHaptics } from "@/lib/haptics"
import { applyTheme, rememberBackground, rememberTheme } from "@/lib/theme"

export function useAppearance() {
  const { theme, appBackground: backgroundId } = usePrefs()
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
    const { style, dims } = appBackground(backgroundId)
    const image = style?.backgroundImage
    rememberBackground(
      localStorage,
      typeof image === "string" ? { image, dims } : null
    )
  }, [backgroundId])
  useEffect(() => {
    configureHaptics({
      enabled: device.haptics,
      iosExperiment: device.iosHapticsExperiment,
    })
  }, [device.haptics, device.iosHapticsExperiment])
}
