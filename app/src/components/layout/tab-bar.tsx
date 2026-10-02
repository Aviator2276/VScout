// The floating glass tab bar (ui-patterns §1, HIG Tab bars): four labelled tabs, the selected one
// filled. Links, so long-press and middle-click work; a plain tap is handled by `onSelect`.
import type { MouseEvent } from "react"
import type { LucideIcon } from "@/components/icons/icon"
import { haptic } from "@/lib/haptics"
import { cn } from "@/lib/utils"

export interface TabItem<TId extends string> {
  id: TId
  label: string
  icon: LucideIcon
  href: string
}

export function TabBar<TId extends string>({
  items,
  active,
  onSelect,
}: {
  items: ReadonlyArray<TabItem<TId>>
  active: TId | null
  onSelect: (id: TId) => void
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
      className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center px-safe-4 pb-safe-4 [view-transition-name:app-tabbar]"
    >
      <ul className="pointer-events-auto flex w-full max-w-md rounded-full glass p-1">
        {items.map((item) => {
          const selected = item.id === active
          const Icon = item.icon
          return (
            <li key={item.id} className="flex-1">
              <a
                href={item.href}
                onClick={click(item.id)}
                aria-current={selected ? "page" : undefined}
                className={cn(
                  "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-full text-caption-2 font-medium",
                  selected
                    ? "font-semibold text-primary"
                    : "text-muted-foreground"
                )}
              >
                <Icon
                  aria-hidden
                  size={24}
                  fill={selected ? "currentColor" : "none"}
                  fillOpacity={selected ? 0.2 : 0}
                />
                {item.label}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
