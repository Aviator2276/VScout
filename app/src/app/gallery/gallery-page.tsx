// The component gallery (roadmap Phase 2 gate): every primitive in every state, in light, dark,
// solid surfaces and AX3 text, driven by the URL so Playwright can check each combination.
import { useEffect, useState } from "react"
import { Segmented } from "@/components/controls/segmented"
import { StackPage } from "@/components/layout/stack-page"
import { applyTheme } from "@/lib/theme"
import { ComponentsPage } from "./components-page"
import { FormPage } from "./form-page"
import type { GallerySearch } from "./gallery-search"
import { MqttProbePage } from "./mqtt-probe-page"
import { OverlaysPage } from "./overlays-page"
import { ScreensPage } from "./screens-page"
import { StatesPage } from "./states-page"

const PAGE_LABELS: Record<GallerySearch["show"], string> = {
  components: "Parts",
  states: "States",
  overlays: "Overlays",
  form: "Form",
  screens: "Screens",
  mqtt: "MQTT",
}

export function GalleryPage({
  search,
  onSearchChange,
}: {
  search: GallerySearch
  onSearchChange: (patch: Partial<GallerySearch>) => void
}) {
  const [now] = useState(() => Date.now())

  useEffect(() => {
    applyTheme(document, {
      preference: search.theme,
      systemDark: matchMedia("(prefers-color-scheme: dark)").matches,
      solidSurfaces: search.surfaces === "solid",
    })
    // iOS AX3 body text is 40 pt against the default 17 pt (ui-design-system §6.2): 17 px → 40 px
    document.documentElement.style.fontSize =
      search.text === "ax3" ? "250%" : ""
    return () => {
      document.documentElement.style.fontSize = ""
    }
  }, [search.theme, search.surfaces, search.text])

  return (
    <StackPage title="Gallery">
      <div className="flex flex-col gap-3">
        <Segmented
          label="Page"
          options={Object.entries(PAGE_LABELS).map(([value, label]) => ({
            value: value as GallerySearch["show"],
            label,
          }))}
          value={search.show}
          onValueChange={(show) => onSearchChange({ show })}
        />
        <Segmented
          label="Theme"
          options={[
            { value: "system", label: "System" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
          value={search.theme}
          onValueChange={(theme) => onSearchChange({ theme })}
        />
        <div className="grid grid-cols-2 gap-3">
          <Segmented
            label="Surfaces"
            options={[
              { value: "glass", label: "Glass" },
              { value: "solid", label: "Solid" },
            ]}
            value={search.surfaces}
            onValueChange={(surfaces) => onSearchChange({ surfaces })}
          />
          <Segmented
            label="Text size"
            options={[
              { value: "default", label: "Default" },
              { value: "ax3", label: "AX3" },
            ]}
            value={search.text}
            onValueChange={(text) => onSearchChange({ text })}
          />
        </div>
      </div>
      {search.show === "components" ? <ComponentsPage now={now} /> : null}
      {search.show === "states" ? <StatesPage /> : null}
      {search.show === "overlays" ? <OverlaysPage /> : null}
      {search.show === "form" ? <FormPage /> : null}
      {search.show === "screens" ? <ScreensPage /> : null}
      {search.show === "mqtt" ? <MqttProbePage /> : null}
    </StackPage>
  )
}
