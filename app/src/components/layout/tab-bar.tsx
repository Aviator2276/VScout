// The tab bar (ui-patterns §1, HIG Tab bars, FX-12): a glass bar anchored to the bottom edge with
// the home indicator inside it, labelled tabs, and one smaller round center button (Messages).
// Links, so long-press and middle-click work; a plain tap is handled by `onSelect`. It slides down
// out of view while `hidden` (immersive pages, scrolling down), and leaves the a11y tree then.
import type { MouseEvent } from "react"
import type { LucideIcon } from "@/components/icons/icon"
import { haptic } from "@/lib/haptics"
import { cn } from "@/lib/utils"

export interface TabItem<TId extends string> {
  id: TId
  label: string
  icon: LucideIcon
  href: string
  /** the round center button: icon only, its label is the accessible name */
  center?: boolean
  /** unread count; hidden at 0 */
  badge?: number
}

function Badge({ count, className }: { count: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "absolute flex min-w-4.5 items-center justify-center rounded-full bg-destructive px-1 text-caption-2 leading-4.5 font-semibold text-white tabular-nums",
        className
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  )
}

export function TabBar<TId extends string>({
  items,
  active,
  onSelect,
  hidden = false,
}: {
  items: ReadonlyArray<TabItem<TId>>
  active: TId | null
  onSelect: (id: TId) => void
  hidden?: boolean
}) {
  const click = (id: TId) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)
      return
    e.preventDefault()
    haptic("selection")
    onSelect(id)
  }
  return (
    <nav
      aria-label="Tabs"
      aria-hidden={hidden || undefined}
      inert={hidden}
      className={cn(
        "px-safe fixed inset-x-0 bottom-0 z-20 rounded-none border-t border-border/60 glass pb-[max(var(--k-safe-area-bottom),0.5rem)] transition-transform duration-300 ease-out [view-transition-name:app-tabbar] motion-reduce:transition-none",
        hidden && "translate-y-full"
      )}
    >
      <ul className="mx-auto flex max-w-xl items-stretch">
        {items.map((item) => {
          const selected = item.id === active
          const Icon = item.icon
          const badge = item.badge ?? 0
          const name = badge > 0 ? `${item.label}, ${badge} unread` : item.label
          if (item.center)
            return (
              <li key={item.id} className="flex flex-1 justify-center">
                <a
                  href={item.href}
                  onClick={click(item.id)}
                  aria-label={name}
                  aria-current={selected ? "page" : undefined}
                  data-center=""
                  className="group flex min-h-12 min-w-12 items-center justify-center"
                >
                  <span
                    className={cn(
                      "relative flex size-10 items-center justify-center rounded-full transition-colors group-active:scale-95",
                      selected
                        ? "bg-primary text-primary-foreground"
                        : "bg-primary/12 text-primary"
                    )}
                  >
                    <Icon aria-hidden size={22} />
                    {badge > 0 ? (
                      <Badge count={badge} className="-top-1 -right-1.5" />
                    ) : null}
                  </span>
                </a>
              </li>
            )
          return (
            <li key={item.id} className="flex-1">
              <a
                href={item.href}
                onClick={click(item.id)}
                aria-label={badge > 0 ? name : undefined}
                aria-current={selected ? "page" : undefined}
                className={cn(
                  "relative flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-caption-2 font-medium active:bg-muted/60",
                  selected
                    ? "font-semibold text-primary"
                    : "text-muted-foreground"
                )}
              >
                <span className="relative">
                  <Icon
                    aria-hidden
                    size={24}
                    fill={selected ? "currentColor" : "none"}
                    fillOpacity={selected ? 0.2 : 0}
                  />
                  {badge > 0 ? (
                    <Badge count={badge} className="-top-1 -right-2.5" />
                  ) : null}
                </span>
                {item.label}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
