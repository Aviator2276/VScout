// What <GlossaryText> needs (features/glossary-help.md §6). The app layer supplies the value: the
// merged terms, the viewer's settings, and how to open the Help panel.
import { createContext, use } from "react"
import type { Segment } from "@/lib/glossary/matcher"
import type { GlossaryTerm } from "@/types/glossary"

export interface GlossaryContextValue {
  segment: (text: string) => ReadonlyArray<Segment>
  termOf: (id: string) => GlossaryTerm | undefined
  underline: "all" | "first" | "off"
  openWith: "long-press" | "tap"
  /** "term:<id>", "guide:<id>" or "glossary" */
  open: (target: string) => void
}

export const GlossaryContext = createContext<GlossaryContextValue | null>(null)

export const useGlossary = () => use(GlossaryContext)
