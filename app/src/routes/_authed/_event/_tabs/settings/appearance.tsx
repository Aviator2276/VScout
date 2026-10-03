import { createFileRoute } from "@tanstack/react-router"
import { BackgroundPicker } from "@/components/controls/background-picker"
import { Check } from "@/components/icons/icon"
import { NavBackButton } from "@/components/layout/nav-back-button"
import { StackPage } from "@/components/layout/stack-page"
import { List } from "@/components/list/list"
import {
  useDeviceSettings,
  useSetDeviceSettings,
} from "@/hooks/use-device-settings"
import { usePrefs, useSetPrefs } from "@/hooks/use-prefs"

export const Route = createFileRoute(
  "/_authed/_event/_tabs/settings/appearance"
)({
  component: Appearance,
})

const THEMES = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const

// Settings → Appearance (features/settings.md, ADR-044): the theme follows you; solid surfaces
// are for this device only (iOS Reduce Transparency can't be detected on the web).
function Appearance() {
  const { theme, appBackground } = usePrefs()
  const setPrefs = useSetPrefs()
  const device = useDeviceSettings()
  const setDevice = useSetDeviceSettings()
  return (
    <StackPage
      title="Appearance"
      leading={<NavBackButton parentHref="/settings" label="Settings" />}
    >
      <List.Section title="Theme">
        {THEMES.map((t) => (
          <List.Row
            key={t.value}
            title={t.label}
            detail={
              theme === t.value ? (
                <Check
                  aria-label="Selected"
                  size={18}
                  className="text-primary"
                />
              ) : undefined
            }
            onSelect={() => void setPrefs({ theme: t.value })}
          />
        ))}
      </List.Section>
      <section aria-labelledby="bg-title" className="mt-6">
        <h2
          id="bg-title"
          className="mb-1.5 px-4 text-footnote text-muted-foreground uppercase"
        >
          Background
        </h2>
        {/* behind the tab screens; cards stay solid so text stays readable (owner) */}
        <BackgroundPicker
          labelledBy="bg-title"
          value={appBackground}
          onValueChange={(id) => void setPrefs({ appBackground: id })}
        />
        <p className="mt-1.5 px-4 text-footnote text-muted-foreground">
          Shows behind Home, Matches, Messages, Teams and Scout. Syncs to your
          other devices.
        </p>
      </section>
      <List.Section footer="Use solid backgrounds instead of see-through bars. Turn on if text is hard to read.">
        <List.Toggle
          title="Solid surfaces"
          checked={device.solidSurfaces}
          onCheckedChange={(solidSurfaces) => void setDevice({ solidSurfaces })}
        />
      </List.Section>
    </StackPage>
  )
}
