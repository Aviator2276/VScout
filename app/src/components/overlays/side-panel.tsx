// A side panel from the right (features/glossary-help.md §5): 88% wide on phones so a sliver of
// the app shows, 400 px on tablets. Base UI Drawer: focus trap, Escape, swipe right, scrim tap.
import type { ReactNode } from "react"
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
  return (
    <Drawer
      open={open}
      onOpenChange={(next) => onOpenChange(next)}
      swipeDirection="right"
    >
      <DrawerContent className="m-0 rounded-none rounded-l-[1.5rem] bg-surface-grouped pt-safe pb-safe [--drawer-content-width:88%]! [--drawer-inset:0px] sm:[--drawer-content-width:400px]!">
        <DrawerHeader className="sticky top-0 z-10 flex flex-row items-center gap-2 glass bg-(--glass-tint) px-3 py-2">
          <div className="min-w-11">{leading}</div>
          <DrawerTitle className="min-w-0 flex-1 truncate text-center text-headline text-foreground">
            {title}
          </DrawerTitle>
          <DrawerClose className="hit-44 flex min-h-11 min-w-11 items-center justify-center rounded-full text-headline text-primary">
            Done
          </DrawerClose>
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6">
          {children}
        </div>
      </DrawerContent>
    </Drawer>
  )
}
