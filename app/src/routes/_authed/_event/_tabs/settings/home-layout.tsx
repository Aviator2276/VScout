import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Check } from "@/components/icons/icon"
import { NavBackButton } from "@/components/layout/nav-back-button"
import { StackPage } from "@/components/layout/stack-page"
import { List } from "@/components/list/list"
import {
  useHomeLayout,
  useSaveHomeLayout,
} from "@/features/home-widgets/api/use-home-layout"
import { templatesFor } from "@/features/home-widgets/utils/templates"
import { APP_BACKGROUNDS } from "@/config/app-backgrounds"
import { usePrefs, useSetPrefs } from "@/hooks/use-prefs"
import { cn } from "@/lib/utils"

export const Route = createFileRoute(
  "/_authed/_event/_tabs/settings/home-layout"
)({
  component: HomeLayout,
})

// Settings → Home Layout (features/home.md H4): the same choices as Home's Layout sheet.
function HomeLayout() {
  const { session } = Route.useRouteContext()
  const layout = useHomeLayout()
  const { save } = useSaveHomeLayout()
  const navigate = useNavigate()
  const prefs = usePrefs()
  const setPrefs = useSetPrefs()
  const active = layout.active
  const tick = (
    <Check aria-label="Selected" size={18} className="text-primary" />
  )
  return (
    <StackPage
      title="Home Screen"
      leading={<NavBackButton parentHref="/settings" label="Settings" />}
    >
      <List.Section footer="Switching never deletes your custom arrangement.">
        {Object.keys(layout.custom).length > 0 ? (
          <List.Row
            title="Custom"
            subtitle="Your own arrangement"
            detail={active.kind === "custom" ? tick : undefined}
            onSelect={() => void save({ kind: "custom" }, layout.custom)}
          />
        ) : null}
        {templatesFor(session.role).map((t) => (
          <List.Row
            key={t.id}
            title={t.name}
            detail={
              active.kind === "template" && active.templateId === t.id
                ? tick
                : undefined
            }
            onSelect={() =>
              void save({ kind: "template", templateId: t.id }, layout.custom)
            }
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
        {/* behind the tab screens only; cards stay solid so text stays readable (owner) */}
        <div
          role="radiogroup"
          aria-labelledby="bg-title"
          className="grid grid-cols-3 gap-3 rounded-2xl bg-card p-3"
        >
          {APP_BACKGROUNDS.map((b) => {
            const on = prefs.appBackground === b.id
            return (
              <button
                key={b.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => void setPrefs({ appBackground: b.id })}
                className="flex flex-col items-center gap-1.5 text-footnote transition-[scale] active:scale-95"
              >
                <span
                  aria-hidden
                  className={cn(
                    "h-16 w-full rounded-xl ring-2 ring-offset-2 ring-offset-card",
                    on ? "ring-primary" : "ring-transparent"
                  )}
                  style={{
                    background:
                      b.id === "none"
                        ? "var(--background)"
                        : `var(--app-bg-${b.id}), var(--background)`,
                  }}
                />
                <span className={on ? "font-semibold" : undefined}>
                  {b.label}
                </span>
              </button>
            )
          })}
        </div>
      </section>
      <List.Section>
        <List.Row
          title="Edit Home"
          onSelect={() => void navigate({ to: "/", search: { edit: true } })}
        />
      </List.Section>
    </StackPage>
  )
}
