// Help & glossary wiring (features/glossary-help.md §6, routing-auth §2.4). The root holds the
// panel, driven by `?help=`, so it works before sign-in (login → "Need help?"). While signed in,
// <SessionHelpSettings> feeds the viewer's underline/open-with settings and guide progress up.
import { useNavigate, useRouter, useRouterState } from "@tanstack/react-router"
import {
  Suspense,
  createContext,
  lazy,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"
import type { ReactNode } from "react"
import { GlossaryContext } from "@/components/glossary/glossary-provider"
import type { GlossaryContextValue } from "@/components/glossary/glossary-provider"
import { activeGame } from "@/config/game"
import { coreGlossary } from "@/content/glossary/core"
import { coreGuides } from "@/content/guides/guides"
import { useToast } from "@/components/overlays/toaster"
import { usePrefs, useSetPrefs } from "@/hooks/use-prefs"
import { createMatcher, mergeTerms } from "@/lib/glossary/matcher"

interface SessionHelp {
  underline: GlossaryContextValue["underline"]
  openWith: GlossaryContextValue["openWith"]
  completedGuides: ReadonlyArray<string>
  markDone: (id: string) => void
}

// the panel (and its markdown renderer) loads the first time Help opens
const HelpPanel = lazy(() =>
  import("@/features/help/components/help-panel").then((m) => ({
    default: m.HelpPanel,
  }))
)

const SetSessionHelp = createContext<(s: SessionHelp | null) => void>(
  () => undefined
)

const TERMS = mergeTerms(coreGlossary, activeGame.glossary)
const MATCHER = createMatcher(TERMS)
const BY_ID = new Map(TERMS.map((t) => [t.id, t]))
const SCOUTING = /^\/scouting(\/|$)/

export function HelpRuntime({ children }: { children: ReactNode }) {
  const router = useRouter()
  const navigate = useNavigate()
  const help: unknown = useRouterState({
    select: (s) => (s.location.search as Record<string, unknown>).help,
  })
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const [session, setSession] = useState<SessionHelp | null>(null)
  // a help target set from inside the app; anything else arrived by a deep link
  const [opened, setOpened] = useState<string | undefined>()
  const toast = useToast()

  const setTarget = useCallback(
    (target: string | undefined) => {
      setOpened(target)
      void navigate({
        to: ".",
        search: (prev) => ({ ...prev, help: target }),
        replace: target === undefined,
      })
    },
    [navigate]
  )
  const glossary = useMemo<GlossaryContextValue>(
    () => ({
      segment: MATCHER.segment,
      termOf: (id) => BY_ID.get(id),
      underline: session?.underline ?? "all",
      openWith: session?.openWith ?? "long-press",
      open: setTarget,
    }),
    [session, setTarget]
  )
  const requested = typeof help === "string" ? help : undefined
  // never over a scouting form by a deep link (ADR-052): offer it in a toast instead
  const held =
    requested !== undefined && requested !== opened && isScoutingPath(pathname)
  const target = held ? undefined : requested
  // keep the panel mounted after first use so it can animate closed
  const [used, setUsed] = useState(false)
  if (target !== undefined && !used) setUsed(true)
  useEffect(() => {
    if (!held) return
    toast.show({
      title: "Help is ready when you finish this form",
      action: { label: "Open Help", onAction: () => setOpened(requested) },
    })
  }, [held, requested, toast])

  return (
    <SetSessionHelp value={setSession}>
      <GlossaryContext value={glossary}>
        {children}
        {target === undefined && !used ? null : (
          <Suspense fallback={null}>
            <HelpPanel
              target={target}
              terms={TERMS}
              guides={coreGuides}
              onTarget={setTarget}
              onBack={() => router.history.back()}
              {...(session
                ? {
                    completedGuides: session.completedGuides,
                    onMarkDone: session.markDone,
                  }
                : {})}
            />
          </Suspense>
        )}
      </GlossaryContext>
    </SetSessionHelp>
  )
}

/** Inside the data runtime: passes the viewer's help settings to the root panel. */
export function SessionHelpSettings() {
  const set = use(SetSessionHelp)
  const prefs = usePrefs()
  const setPrefs = useSetPrefs()
  const help = prefs.help
  const level = prefs.scouterLevel
  useEffect(() => {
    const completed = help?.completedGuides ?? []
    set({
      // experienced scouters default to the first occurrence per paragraph (§2)
      underline: help?.underline ?? (level === "experienced" ? "first" : "all"),
      openWith: help?.openWith ?? "long-press",
      completedGuides: completed,
      markDone: (id) =>
        void setPrefs({
          help: {
            openWith: help?.openWith ?? "long-press",
            ...help,
            completedGuides: [...new Set([...completed, id])],
          },
        }),
    })
  }, [set, help, level, setPrefs])
  useEffect(() => () => set(null), [set])
  return null
}

/** A deep link must not open the panel over a scouting form (ADR-052, routing-auth §2.4). */
export const isScoutingPath = (pathname: string) => SCOUTING.test(pathname)
