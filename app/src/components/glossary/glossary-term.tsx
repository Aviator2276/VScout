// One underlined glossary word (features/glossary-help.md §3, FX-31): a long-press (or a tap, by
// setting) shows a small tooltip with the term's short definition and "More in Help", instead of
// jumping straight into the Help panel. Enter, Space and assistive-tech clicks always show it, so
// nobody needs the long-press. The iOS callout is suppressed on the term only.
import { Popover } from "@base-ui/react/popover"
import { useRef, useState } from "react"
import type { KeyboardEvent, MouseEvent, PointerEvent } from "react"
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
  const anchor = useRef<HTMLSpanElement>(null)
  const [tip, setTip] = useState(false)
  const show = () => setTip(true)
  const press = useLongPress(() => {
    haptic("selection")
    show()
  })
  if (!ctx) return children
  const term = ctx.termOf(termId)
  const longPress = ctx.openWith === "long-press"
  return (
    <>
      <span
        ref={anchor}
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        aria-expanded={tip}
        // an inline target in running text: exempt from the 44 pt rule (WCAG 2.5.8)
        data-inline-target=""
        aria-description={term?.short}
        className={cn(
          "cursor-help rounded-sm underline decoration-muted-foreground decoration-dotted underline-offset-3 transition-colors duration-500 select-none [-webkit-touch-callout:none]",
          ((press.pressing && longPress) || tip) && "bg-current/20"
        )}
        // the word's own press and callout: a long-pressable parent (a chat bubble) mustn't
        // also fire its own menu
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
        {...(longPress
          ? {
              ...press.handlers,
              onPointerDown: (e: PointerEvent) => {
                e.stopPropagation()
                press.handlers.onPointerDown(e)
              },
            }
          : {})}
        onClick={(e: MouseEvent) => {
          // detail 0: a keyboard or screen-reader activation
          if (!longPress || e.detail === 0) show()
        }}
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            show()
          }
        }}
      >
        {children}
      </span>
      <Popover.Root open={tip} onOpenChange={setTip}>
        <Popover.Portal>
          <Popover.Positioner
            anchor={anchor}
            side="top"
            sideOffset={8}
            collisionPadding={12}
            className="z-[70]"
          >
            <Popover.Popup className="w-[min(18rem,calc(100vw-2rem))] origin-(--transform-origin) rounded-2xl glass bg-(--glass-tint-sheet) p-3 text-start shadow-xl transition-[scale,opacity] duration-200 outline-none data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
              <Popover.Title className="text-headline text-foreground">
                {term?.term ?? children}
              </Popover.Title>
              <Popover.Description className="mt-0.5 line-clamp-4 text-subhead text-muted-foreground">
                {term?.short ?? ""}
              </Popover.Description>
              <button
                type="button"
                onClick={() => {
                  setTip(false)
                  ctx.open(`term:${termId}`)
                }}
                className="mt-1 -mb-1 min-h-11 text-subhead font-semibold text-primary active:opacity-60"
              >
                More in Help
              </button>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </>
  )
}
