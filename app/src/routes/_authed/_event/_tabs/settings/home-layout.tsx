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
  const active = layout.active
  const tick = (
    <Check aria-label="Selected" size={18} className="text-primary" />
  )
  return (
    <StackPage
      title="Home Layout"
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
      <List.Section>
        <List.Row
          title="Edit Home"
          onSelect={() => void navigate({ to: "/", search: { edit: true } })}
        />
      </List.Section>
    </StackPage>
  )
}
