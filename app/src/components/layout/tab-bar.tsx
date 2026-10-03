// The floating glass tab bar (ui-patterns §1, HIG Tab bars): a rounded liquid-glass pill above the
// home indicator with four labelled tabs and the smaller round Messages button in the middle
// (FX-12). The selection is a frosted light lens (iOS 26) that glides between tabs and keeps the
// label readable whatever scrolls behind the glass; a press shrinks the tab a
// little; the whole bar slides down and fades out while `hidden` (immersive pages, scrolling down)
// and leaves the a11y tree. Links, so long-press and middle-click work; a tap goes to `onSelect`.
import { m } from "motion/react"
import type { MouseEvent } from "react"
import type { LucideIcon } from "@/components/icons/icon"
import { springs } from "@/components/motion/springs"
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
        "pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center px-safe-4 pb-safe-4 transition-[translate,opacity] duration-[380ms] ease-[cubic-bezier(0.32,0.72,0,1)] [view-transition-name:app-tabbar] motion-reduce:transition-none",
        hidden &&
          "translate-y-[calc(100%+var(--k-safe-area-bottom,0px))] opacity-0"
      )}
    >
      <ul className="pointer-events-auto flex w-full max-w-md items-center rounded-full glass p-1 shadow-lg">
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
                      "relative flex size-10 items-center justify-center rounded-full shadow-sm transition-[scale,background-color,color] duration-200 group-active:scale-90",
                      selected
                        ? "bg-primary text-primary-foreground"
                        : "bg-primary/15 text-primary"
                    )}
                  >
                    <Icon aria-hidden size={21} />
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
                  "group relative flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-full text-caption-2 font-medium transition-colors",
                  selected
                    ? "font-semibold text-primary dark:text-foreground"
                    : "text-muted-foreground"
                )}
              >
                {selected ? (
                  <m.span
                    aria-hidden
                    layoutId="tab-bar-lens"
                    transition={springs.smooth}
                    className="absolute inset-0 rounded-full bg-white/75 shadow-sm ring-1 ring-black/5 dark:bg-white/15 dark:ring-white/10"
                  />
                ) : null}
                <span className="relative flex flex-col items-center gap-0.5 transition-[scale] duration-150 group-active:scale-90">
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
                </span>
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
