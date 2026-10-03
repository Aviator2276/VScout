// The Help panel (features/glossary-help.md §5): Glossary · Guides with one search, category
// filters, term detail with related terms, and guide pages. Driven by the root `?help=` param:
// "glossary", "guides", "term:<id>", "guide:<id>". Every step is a URL, so Back walks the stack.
import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/controls/button"
import { ChoiceChips } from "@/components/controls/choice-chips"
import { Segmented } from "@/components/controls/segmented"
import { SearchField } from "@/components/form/search-field"
import { ChevronLeft } from "@/components/icons/icon"
import { List } from "@/components/list/list"
import { Markdown } from "@/components/markdown/markdown"
import { SidePanel } from "@/components/overlays/side-panel"
import type {
  GlossaryCategory,
  GlossaryTerm,
  GuideMeta,
} from "@/types/glossary"
import { TermFigure } from "./term-figure"

export interface HelpPanelProps {
  target: string | undefined
  terms: ReadonlyArray<GlossaryTerm>
  guides: ReadonlyArray<GuideMeta>
  /** navigate to another help target (pushes history), or close with undefined */
  onTarget: (target: string | undefined) => void
  onBack: () => void
  completedGuides?: ReadonlyArray<string>
  onMarkDone?: (guideId: string) => void
}

const CATEGORIES: ReadonlyArray<{
  value: GlossaryCategory | "all"
  label: string
}> = [
  { value: "all", label: "All" },
  { value: "game", label: "Game" },
  { value: "robot", label: "Robot" },
  { value: "match", label: "Match" },
  { value: "strategy", label: "Strategy" },
  { value: "vscout", label: "VScout" },
]
const CATEGORY_LABEL = Object.fromEntries(
  CATEGORIES.map((c) => [c.value, c.label])
)

const matches = (q: string, ...fields: ReadonlyArray<string | undefined>) =>
  fields.some((f) => f?.toLowerCase().includes(q))

export function HelpPanel(props: HelpPanelProps) {
  const { target } = props
  const [kind, id] = target?.includes(":")
    ? (target.split(/:(.*)/s) as [string, string])
    : [target, ""]
  const term =
    kind === "term" ? props.terms.find((t) => t.id === id) : undefined
  const guide =
    kind === "guide" ? props.guides.find((g) => g.id === id) : undefined
  const title =
    kind === "term"
      ? (term?.term ?? "Glossary")
      : kind === "guide"
        ? (guide?.title ?? "Guides")
        : "Help"
  const nested = kind === "term" || kind === "guide"
  return (
    <SidePanel
      open={target !== undefined}
      onOpenChange={(o) => {
        if (!o) props.onTarget(undefined)
      }}
      title={title}
      leading={
        nested ? (
          <button
            type="button"
            onClick={props.onBack}
            className="flex min-h-11 items-center text-body text-primary"
          >
            <ChevronLeft aria-hidden size={22} />
            Back
          </button>
        ) : undefined
      }
    >
      {kind === "term" ? (
        <TermDetail id={id} term={term} {...props} />
      ) : kind === "guide" ? (
        <GuidePage id={id} guide={guide} {...props} />
      ) : (
        <Browse tab={kind === "guides" ? "guides" : "glossary"} {...props} />
      )}
    </SidePanel>
  )
}

function Browse({
  tab,
  terms,
  guides,
  onTarget,
}: HelpPanelProps & { tab: "glossary" | "guides" }) {
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<GlossaryCategory | "all">("all")
  const q = query.trim().toLowerCase()
  const shownTerms = useMemo(
    () =>
      terms.filter(
        (t) =>
          (category === "all" || t.category === category) &&
          (!q || matches(q, t.term, t.short, ...(t.aliases ?? [])))
      ),
    [terms, category, q]
  )
  const shownGuides = guides.filter((g) => !q || matches(q, g.title, g.summary))
  const sections = useMemo(() => {
    const by = new Map<string, Array<GlossaryTerm>>()
    for (const t of shownTerms) {
      const letter = t.term.charAt(0).toUpperCase()
      by.set(letter, [...(by.get(letter) ?? []), t])
    }
    return [...by.entries()]
  }, [shownTerms])

  return (
    <div className="flex flex-col gap-2 pt-2">
      <Segmented
        label="Help section"
        value={tab}
        onValueChange={(v) => onTarget(v)}
        options={[
          { value: "glossary", label: "Glossary" },
          { value: "guides", label: "Guides" },
        ]}
      />
      <SearchField
        label="Search terms and guides"
        landmark="Help"
        placeholder="Search terms and guides"
        value={query}
        onValueChange={setQuery}
      />
      {tab === "glossary" ? (
        <>
          <ChoiceChips
            label="Category"
            options={CATEGORIES}
            value={category}
            onValueChange={setCategory}
          />
          {sections.length === 0 ? (
            <Empty
              text={`No terms match “${query}”`}
              clearLabel="Show All Terms"
              onClear={() => setQuery("")}
            />
          ) : (
            sections.map(([letter, list]) => (
              <List.Section key={letter} title={letter}>
                {list.map((t) => (
                  <List.Row
                    key={t.id}
                    title={t.term}
                    subtitle={t.short}
                    onSelect={() => onTarget(`term:${t.id}`)}
                  />
                ))}
              </List.Section>
            ))
          )}
        </>
      ) : shownGuides.length === 0 ? (
        <Empty
          text={`No guides match “${query}”`}
          clearLabel="Show All Guides"
          onClear={() => setQuery("")}
        />
      ) : (
        <List.Section>
          {shownGuides.map((g) => (
            <List.Row
              key={g.id}
              title={g.title}
              subtitle={g.summary}
              onSelect={() => onTarget(`guide:${g.id}`)}
            />
          ))}
        </List.Section>
      )}
    </div>
  )
}

function Empty({
  text,
  clearLabel,
  onClear,
}: {
  text: string
  clearLabel: string
  onClear: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <p className="text-body text-muted-foreground">{text}</p>
      <Button variant="secondary" onClick={onClear}>
        {clearLabel}
      </Button>
    </div>
  )
}

function TermDetail({
  id,
  term,
  terms,
  guides,
  onTarget,
}: HelpPanelProps & { id: string; term: GlossaryTerm | undefined }) {
  if (!term)
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-body text-muted-foreground">
          “{id}” isn’t in the glossary.
        </p>
        <Button variant="secondary" onClick={() => onTarget("glossary")}>
          Search the Glossary
        </Button>
      </div>
    )
  const related = (term.related ?? []).flatMap((r) =>
    terms.filter((t) => t.id === r)
  )
  const guide = term.seeAlsoGuide
    ? guides.find((g) => g.id === term.seeAlsoGuide)
    : undefined
  return (
    <article className="flex flex-col gap-3 pt-3">
      <span className="self-start rounded-full bg-muted px-2.5 py-0.5 text-caption-1 text-muted-foreground">
        {CATEGORY_LABEL[term.category]}
      </span>
      <p className="text-headline">{term.short}</p>
      {term.image ? <TermFigure image={term.image} /> : null}
      {term.body ? <Markdown>{term.body}</Markdown> : null}
      {related.length > 0 ? (
        <List.Section title="Related terms">
          {related.map((t) => (
            <List.Row
              key={t.id}
              title={t.term}
              subtitle={t.short}
              onSelect={() => onTarget(`term:${t.id}`)}
            />
          ))}
        </List.Section>
      ) : null}
      {guide ? (
        <List.Section title="Learn more">
          <List.Row
            title={guide.title}
            subtitle={guide.summary}
            onSelect={() => onTarget(`guide:${guide.id}`)}
          />
        </List.Section>
      ) : null}
    </article>
  )
}

type Loaded =
  { status: "loading" } | { status: "error" } | { status: "ok"; text: string }

function GuidePage({
  id,
  guide,
  onTarget,
  completedGuides,
  onMarkDone,
}: HelpPanelProps & { id: string; guide: GuideMeta | undefined }) {
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState<Loaded & { id?: string }>({
    status: "loading",
  })
  useEffect(() => {
    if (!guide) return
    let live = true
    guide
      .load()
      .then((m) => {
        if (live) setLoaded({ status: "ok", text: m.default, id: guide.id })
      })
      .catch(() => {
        if (live) setLoaded({ status: "error", id: guide.id })
      })
    return () => {
      live = false
    }
  }, [guide, attempt])

  if (!guide)
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-body text-muted-foreground">
          This guide was removed or renamed.
        </p>
        <Button variant="secondary" onClick={() => onTarget("guides")}>
          All Guides
        </Button>
      </div>
    )
  const current = loaded.id === id ? loaded : { status: "loading" as const }
  if (current.status === "loading")
    return (
      <div
        role="status"
        aria-label="Loading guide"
        className="flex flex-col gap-3 pt-4"
      >
        <div className="h-7 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-4 w-full animate-pulse rounded bg-muted" />
        <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
      </div>
    )
  if (current.status === "error")
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-body text-muted-foreground">
          Couldn’t open this guide.
        </p>
        <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
          Try Again
        </Button>
      </div>
    )
  const done = completedGuides?.includes(id) ?? false
  return (
    <article className="pt-3">
      <Markdown>{current.text}</Markdown>
      {onMarkDone ? (
        <Button
          variant={done ? "plain" : "secondary"}
          disabled={done}
          onClick={() => onMarkDone(id)}
        >
          {done ? "Done ✓" : "Mark as Done"}
        </Button>
      ) : null}
    </article>
  )
}
