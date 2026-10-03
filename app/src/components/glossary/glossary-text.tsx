// User-written text (notes, messages, announcements, guides) with glossary terms linked
// (features/glossary-help.md §2, ADR-055). Opt-in per component: no global DOM scanning. Without a
// provider, or with underlines off, it's the plain text with its line breaks.
import { Fragment } from "react"
import { firstPerParagraph } from "@/lib/glossary/matcher"
import { useGlossary } from "./glossary-provider"
import { GlossaryTerm } from "./glossary-term"

export function GlossaryText({ children }: { children: string }) {
  const ctx = useGlossary()
  const lines = children.split("\n")
  const linked = ctx && ctx.underline !== "off" ? ctx : null
  return (
    <>
      {lines.map((line, i) => {
        const raw = linked ? linked.segment(line) : [line]
        const segments =
          linked?.underline === "first" ? firstPerParagraph(raw) : raw
        return (
          <Fragment key={i}>
            {i > 0 ? <br /> : null}
            {segments.map((s, j) =>
              typeof s === "string" ? (
                <Fragment key={j}>{s}</Fragment>
              ) : (
                <GlossaryTerm key={j} termId={s.termId}>
                  {s.text}
                </GlossaryTerm>
              )
            )}
          </Fragment>
        )
      })}
    </>
  )
}
