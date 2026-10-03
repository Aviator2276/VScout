// A side panel from the right (features/glossary-help.md §5): 88% wide on phones so a sliver of
// the app shows, 400 px on tablets. Base UI Drawer: focus trap, Escape, swipe right, scrim tap.
import type { ReactNode } from "react"
import { useMountedOpen } from "@/hooks/use-mounted-open"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"

export function SidePanel({
  open,
  onOpenChange,
  title,
  leading,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** a Back button inside the panel's own stack */
  leading?: ReactNode
  children: ReactNode
}) {
  // lazy-loaded on first use: it mounted open and "teleported" in instead of sliding
  const shown = useMountedOpen(open)
  return (
    <Drawer
      open={shown}
      onOpenChange={(next) => onOpenChange(next)}
      swipeDirection="right"
    >
      {/* Edge to edge like an iOS sheet: the header's glass runs up under the status bar and the
          list scrolls under the home indicator; the insets are padding inside them, not around
          the panel (they left a plain band on top and cut the list off with a hard edge). */}
      <DrawerContent className="m-0 rounded-none rounded-l-[1.5rem] bg-surface-grouped [--drawer-content-width:88%]! [--drawer-inset:0px] sm:[--drawer-content-width:400px]!">
        <DrawerHeader className="sticky top-0 z-10 flex flex-row items-center gap-2 rounded-tl-[1.5rem] glass bg-(--glass-tint) px-3 pt-[calc(var(--k-safe-area-top,0px)+0.5rem)] pb-2">
          <div className="min-w-11">{leading}</div>
          <DrawerTitle className="min-w-0 flex-1 truncate text-center text-headline text-foreground">
            {title}
          </DrawerTitle>
          <DrawerClose className="hit-44 flex min-h-11 min-w-11 items-center justify-center rounded-full text-headline text-primary">
            Done
          </DrawerClose>
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(var(--k-safe-area-bottom,0px)+1.5rem)]">
          {children}
        </div>
      </DrawerContent>
    </Drawer>
  )
}
