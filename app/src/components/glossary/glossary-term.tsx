// One underlined glossary word (features/glossary-help.md §3): a long-press (or a tap, by setting)
// opens Help at the term; Enter, Space and assistive-tech clicks always do, so nobody needs the
// long-press. The iOS callout is suppressed on the term only; the paragraph stays selectable.
import type { KeyboardEvent, MouseEvent } from "react"
import { useLongPress } from "@/hooks/use-long-press"
import { haptic } from "@/lib/haptics"
import { cn } from "@/lib/utils"
import { useGlossary } from "./glossary-provider"

export function GlossaryTerm({
  termId,
  children,
}: {
  termId: string
  children: string
}) {
  const ctx = useGlossary()
  const open = () => ctx?.open(`term:${termId}`)
  const press = useLongPress(() => {
    haptic("selection")
    open()
  })
  if (!ctx) return children
  const term = ctx.termOf(termId)
  const longPress = ctx.openWith === "long-press"
  return (
    <span
      role="button"
      tabIndex={0}
      aria-haspopup="dialog"
      // an inline target in running text: exempt from the 44 pt rule (WCAG 2.5.8)
      data-inline-target=""
      aria-description={term?.short}
      className={cn(
        "cursor-help rounded-sm underline decoration-muted-foreground decoration-dotted underline-offset-3 transition-colors duration-500 select-none [-webkit-touch-callout:none]",
        press.pressing && longPress && "bg-muted"
      )}
      onContextMenu={(e) => e.preventDefault()}
      {...(longPress ? press.handlers : {})}
      onClick={(e: MouseEvent) => {
        // detail 0: a keyboard or screen-reader activation
        if (!longPress || e.detail === 0) open()
      }}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          open()
        }
      }}
    >
      {children}
    </span>
  )
}
