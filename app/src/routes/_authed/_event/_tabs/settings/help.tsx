import { createFileRoute } from "@tanstack/react-router"
import { Segmented } from "@/components/controls/segmented"
import { useGlossary } from "@/components/glossary/glossary-provider"
import { BookOpen, CircleHelp } from "@/components/icons/icon"
import { NavBackButton } from "@/components/layout/nav-back-button"
import { StackPage } from "@/components/layout/stack-page"
import { List } from "@/components/list/list"
import { usePrefs, useSetPrefs } from "@/hooks/use-prefs"

export const Route = createFileRoute("/_authed/_event/_tabs/settings/help")({
  component: HelpSettings,
})

// Settings → Help & Glossary (FX-30): how glossary words look and open, and the way into Help.
// These used to sit inline on the Settings list, which made it look unorganized.
function HelpSettings() {
  const prefs = usePrefs()
  const setPrefs = useSetPrefs()
  const glossary = useGlossary()
  const help = prefs.help ?? {
    underline: "all",
    openWith: "long-press",
    completedGuides: [],
  }
  return (
    <StackPage
      title="Help & Glossary"
      leading={<NavBackButton parentHref="/settings" label="Settings" />}
    >
      <List.Section>
        <List.Row
          title="Glossary"
          leading={<List.Icon icon={CircleHelp} tone="teal" />}
          onSelect={() => glossary?.open("glossary")}
        />
        <List.Row
          title="Guides"
          leading={<List.Icon icon={BookOpen} tone="orange" />}
          onSelect={() => glossary?.open("guides")}
        />
      </List.Section>
      <section className="mt-6 flex flex-col gap-2">
        <h2 className="px-4 text-footnote text-muted-foreground uppercase">
          Underline glossary words
        </h2>
        <Segmented
          label="Underline glossary words"
          value={help.underline ?? "all"}
          onValueChange={(underline) =>
            void setPrefs({ help: { ...help, underline } })
          }
          options={[
            { value: "all", label: "Every Time" },
            { value: "first", label: "First Time" },
            { value: "off", label: "Off" },
          ]}
        />
        <p className="px-4 text-footnote text-muted-foreground">
          Underlined words explain themselves: press one to see what it means.
        </p>
      </section>
      <section className="mt-6 flex flex-col gap-2">
        <h2 className="px-4 text-footnote text-muted-foreground uppercase">
          Show a definition with
        </h2>
        <Segmented
          label="Show a definition with"
          value={help.openWith}
          onValueChange={(openWith) =>
            void setPrefs({ help: { ...help, openWith } })
          }
          options={[
            { value: "long-press", label: "Long Press" },
            { value: "tap", label: "Tap" },
          ]}
        />
      </section>
    </StackPage>
  )
}
