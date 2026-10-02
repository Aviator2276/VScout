import { createFileRoute } from "@tanstack/react-router"
import { Segmented } from "@/components/controls/segmented"
import { NavBackButton } from "@/components/layout/nav-back-button"
import { StackPage } from "@/components/layout/stack-page"
import { List } from "@/components/list/list"
import {
  useDeviceSettings,
  useSetDeviceSettings,
} from "@/hooks/use-device-settings"
import { usePrefs, useSetPrefs } from "@/hooks/use-prefs"
import { requirePermission } from "@/lib/authorization"

export const Route = createFileRoute("/_authed/_event/_tabs/settings/scouting")(
  {
    beforeLoad: ({ context }) => {
      requirePermission(context.session, "scouting:create")
    },
    component: Scouting,
  }
)

// Settings → Scouting (features/settings.md, ADR-039): level and celebrations sync; haptics and
// screen-awake stay on this device.
function Scouting() {
  const prefs = usePrefs()
  const setPrefs = useSetPrefs()
  const device = useDeviceSettings()
  const setDevice = useSetDeviceSettings()
  return (
    <StackPage
      title="Scouting"
      leading={<NavBackButton parentHref="/settings" label="Settings" />}
    >
      <section className="mt-2 flex flex-col gap-2">
        <h2 className="px-4 text-footnote text-muted-foreground uppercase">
          Experience level
        </h2>
        <Segmented
          label="Experience level"
          value={prefs.scouterLevel}
          onValueChange={(scouterLevel) => void setPrefs({ scouterLevel })}
          options={[
            { value: "new", label: "New" },
            { value: "experienced", label: "Experienced" },
          ]}
        />
        <p className="px-4 text-footnote text-muted-foreground">
          New shows hints and step-by-step helpers in scouting forms. Takes
          effect on the next form you open.
        </p>
      </section>
      <List.Section title="While scouting">
        <List.Toggle
          title="Celebrate submissions"
          checked={prefs.celebrate}
          onCheckedChange={(celebrate) => void setPrefs({ celebrate })}
        />
        <List.Toggle
          title="Haptics"
          checked={device.haptics}
          onCheckedChange={(haptics) => void setDevice({ haptics })}
        />
        <List.Toggle
          title="Keep screen awake"
          checked={device.keepScreenAwake}
          onCheckedChange={(keepScreenAwake) =>
            void setDevice({ keepScreenAwake })
          }
        />
      </List.Section>
    </StackPage>
  )
}
