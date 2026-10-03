// Guide and term markdown (features/glossary-help.md §6): markdown-to-jsx renders React elements
// (no innerHTML), and every text node goes through <GlossaryText> so terms are linked here too.
import { Markdown as Md, RuleType } from "markdown-to-jsx/react"
import { GlossaryText } from "@/components/glossary/glossary-text"

const OVERRIDES = {
  h1: { props: { className: "mb-3 font-heading text-title-2" } },
  h2: { props: { className: "mt-4 mb-2 text-headline" } },
  p: { props: { className: "mb-3 text-body" } },
  ol: { props: { className: "mb-3 list-decimal pl-6 text-body" } },
  ul: { props: { className: "mb-3 list-disc pl-6 text-body" } },
  li: { props: { className: "mb-1" } },
  a: {
    props: {
      className: "text-primary underline",
      target: "_blank",
      rel: "noreferrer",
    },
  },
}

// forceBlock: a one-paragraph body still renders as a <p>. Bare inline nodes inside a flex parent
// (the term detail) became separate flex items, breaking the line after every linked term.
export function Markdown({ children }: { children: string }) {
  return (
    <Md
      options={{
        forceBlock: true,
        forceWrapper: true,
        overrides: OVERRIDES,
        renderRule(next, node, _children, state) {
          if (node.type === RuleType.text)
            return <GlossaryText key={state.key}>{node.text}</GlossaryText>
          return next()
        },
      }}
    >
      {children}
    </Md>
  )
}
