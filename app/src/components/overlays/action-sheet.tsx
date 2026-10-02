// iOS action sheet (choices about one thing) on Base UI Drawer, styled like Konsta's Actions.
// Destructive choices are red and listed first-to-last as given; Cancel is always separate.
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer"
import { haptic } from "@/lib/haptics"
import { cn } from "@/lib/utils"

export interface ActionSheetAction {
  label: string
  onSelect: () => void
  destructive?: boolean
}

export interface ActionSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** short question, e.g. "Delete this entry?" */
  title: string
  message?: string
  actions: ReadonlyArray<ActionSheetAction>
  cancelLabel?: string
}

const ROW =
  "flex min-h-14 w-full items-center justify-center px-4 text-title-3 active:bg-muted"

export function ActionSheet({
  open,
  onOpenChange,
  title,
  message,
  actions,
  cancelLabel = "Cancel",
}: ActionSheetProps) {
  return (
    <Drawer open={open} onOpenChange={(next) => onOpenChange(next)}>
      <DrawerContent className="border-0 bg-transparent pb-safe shadow-none [--drawer-inset:--spacing(2)]">
        <div className="flex flex-col gap-2 px-2 pb-2">
          <div className="overflow-hidden rounded-2xl bg-popover">
            <div className="flex flex-col items-center gap-1 border-b border-border px-4 py-3 text-center">
              <DrawerTitle className="text-footnote font-semibold text-muted-foreground">
                {title}
              </DrawerTitle>
              {message ? (
                <DrawerDescription className="text-footnote text-muted-foreground">
                  {message}
                </DrawerDescription>
              ) : null}
            </div>
            {actions.map((a) => (
              <button
                key={a.label}
                type="button"
                className={cn(
                  ROW,
                  "border-b border-border last:border-b-0",
                  a.destructive ? "text-destructive" : "text-primary"
                )}
                onClick={() => {
                  if (a.destructive) haptic("warning")
                  onOpenChange(false)
                  a.onSelect()
                }}
              >
                {a.label}
              </button>
            ))}
          </div>
          <DrawerClose
            className={cn(
              ROW,
              "rounded-2xl bg-popover font-semibold text-primary"
            )}
          >
            {cancelLabel}
          </DrawerClose>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
