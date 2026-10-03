// A large tooltip anchored under an element, with a caret pointing at it (ui-design-system §3 wrapper
// over Base UI Popover). Tapping outside or Escape closes it and focus returns to the anchor. Used by
// the Sync Status notch (features/sync-status.md S3).
import { Popover } from "@base-ui/react/popover"
import type { ReactNode, RefObject } from "react"
import { cn } from "@/lib/utils"

export function AnchoredPopover({
  open,
  onOpenChange,
  anchor,
  title,
  className,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  anchor: RefObject<HTMLElement | null>
  /** the accessible name ("Sync") */
  title: string
  className?: string
  children: ReactNode
}) {
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Portal>
        <Popover.Positioner
          anchor={anchor}
          side="bottom"
          align="center"
          sideOffset={4}
          collisionPadding={12}
          className="z-50"
        >
          <Popover.Popup
            finalFocus={anchor}
            className={cn(
              "relative origin-(--transform-origin) rounded-3xl bg-popover shadow-2xl ring-1 ring-black/5 transition-[scale,opacity] duration-200 outline-none data-[ending-style]:scale-90 data-[ending-style]:opacity-0 data-[starting-style]:scale-90 data-[starting-style]:opacity-0 motion-reduce:data-[ending-style]:scale-100 motion-reduce:data-[starting-style]:scale-100 dark:ring-white/10",
              className
            )}
          >
            <Popover.Arrow className="data-[side=bottom]:-top-2">
              <svg
                aria-hidden
                width="20"
                height="9"
                viewBox="0 0 20 9"
                className="fill-popover"
              >
                <path d="M0 9C4 9 7 1 10 1s6 8 10 8Z" />
              </svg>
            </Popover.Arrow>
            <Popover.Title className="sr-only">{title}</Popover.Title>
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
