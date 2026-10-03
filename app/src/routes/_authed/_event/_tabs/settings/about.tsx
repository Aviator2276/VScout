import { createFileRoute } from "@tanstack/react-router"
import { NavBackButton } from "@/components/layout/nav-back-button"
import { StackPage } from "@/components/layout/stack-page"
import { List } from "@/components/list/list"
import { FEEDBACK_ENABLED } from "@/config/feedback"
import { activeGame } from "@/config/game"
import { APP_BUILT_AT, APP_COMMIT, APP_VERSION } from "@/config/version"

export const Route = createFileRoute("/_authed/_event/_tabs/settings/about")({
  component: About,
})

const built = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
})

// Settings → About (features/settings.md, ADR-068): one version source; update controls live in Storage.
function About() {
  const builtAt = Date.parse(APP_BUILT_AT)
  return (
    <StackPage
      title="About"
      leading={<NavBackButton parentHref="/settings" label="Settings" />}
    >
      <List.Section>
        <List.Row title="Version" detail={APP_VERSION} />
        <List.Row
          title="Build"
          detail={APP_COMMIT}
          {...(Number.isNaN(builtAt)
            ? {}
            : { subtitle: built.format(builtAt) })}
        />
        <List.Row
          title="Game module"
          detail={`${activeGame.id} · v${activeGame.schemaVersion}`}
        />
      </List.Section>
      <List.Section
        footer={
          FEEDBACK_ENABLED
            ? "This is a testing build. Tell us what broke or what could be better."
            : "To report a problem, export diagnostics and send the file to your admin."
        }
      >
        {FEEDBACK_ENABLED ? (
          <List.Row title="Send Feedback" href="/settings/feedback" />
        ) : null}
        <List.Row title="Export Diagnostics" href="/settings/storage" />
      </List.Section>
      <List.Section title="Updates">
        <List.Row
          title="Check for Updates"
          subtitle="In Storage & Diagnostics"
          href="/settings/storage"
        />
      </List.Section>
    </StackPage>
  )
}
