// iOS sheet on Base UI Drawer (ui-design-system §2: Konsta's sheets aren't accessible dialogs).
// Focus trap, Escape, swipe-down, portal. Every sheet has a visible title and a Done/Close button
// as the alternative to swiping (HIG). Compound: <Sheet>, <Sheet.Content>, <Sheet.Footer>.
import type { ReactNode } from "react"
import { X } from "@/components/icons/icon"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { cn } from "@/lib/utils"

export interface SheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}

function SheetRoot({ open, onOpenChange, children }: SheetProps) {
  return (
    <Drawer
      open={open}
      onOpenChange={(next) => onOpenChange(next)}
      showSwipeHandle
    >
      {children}
    </Drawer>
  )
}

export interface SheetContentProps {
  title: string
  description?: string
  /** medium ≈ half height (iOS medium detent), large = full height */
  detent?: "medium" | "large"
  /** glass only for short sheets without much text (HIG Materials, ui-design-system §7.2) */
  surface?: "solid" | "glass"
  /** label of the close button; "Done" for sheets that edit, "Close" for sheets that show */
  closeLabel?: "Done" | "Close"
  children: ReactNode
}

function Content({
  title,
  description,
  detent = "medium",
  surface = "solid",
  closeLabel = "Close",
  children,
}: SheetContentProps) {
  return (
    <DrawerContent
      className={cn(
        "rounded-t-[2.375rem] pb-safe",
        detent === "medium"
          ? "[--drawer-height:55dvh]"
          : "[--drawer-height:calc(100dvh-3rem)]",
        surface === "glass"
          ? "glass bg-(--glass-tint-sheet)"
          : "bg-surface-grouped"
      )}
    >
      {/* iOS sheet header: the title centered over the sheet, a close button on the trailing
          side and an equal spacer on the leading side so it stays centered (owner) */}
      <DrawerHeader className="grid grid-cols-[4.5rem_1fr_4.5rem] items-center gap-2 px-4 pt-2 pb-3">
        <span aria-hidden />
        <div className="min-w-0 text-center">
          <DrawerTitle className="truncate font-heading text-title-3 text-foreground">
            {title}
          </DrawerTitle>
          {description ? (
            <DrawerDescription className="truncate text-subhead text-muted-foreground">
              {description}
            </DrawerDescription>
          ) : null}
        </div>
        <DrawerClose
          aria-label={closeLabel === "Done" ? undefined : "Close"}
          className="hit-44 flex min-h-11 min-w-11 items-center justify-center justify-self-end rounded-full text-headline text-primary"
        >
          {closeLabel === "Done" ? "Done" : <X aria-hidden size={22} />}
        </DrawerClose>
      </DrawerHeader>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
        {children}
      </div>
    </DrawerContent>
  )
}

function Footer({ children }: { children: ReactNode }) {
  return <DrawerFooter className="px-4 pb-4">{children}</DrawerFooter>
}

export const Sheet = Object.assign(SheetRoot, { Content, Footer })
