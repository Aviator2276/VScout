// A Home widget's card (features/home.md H2): a solid card, 22 pt radius, a small title that links
// to the full screen, and the widget's content. Tiny tiles show only an icon with a full name.
import { use } from "react"
import type { ReactNode } from "react"
import { ListLinkContext } from "@/components/list/list"
import { cn } from "@/lib/utils"

export function WidgetCard({
  title,
  href,
  children,
  compact = false,
}: {
  title: string
  href?: string
  children: ReactNode
  /** 1×1 and 2×1 tiles: tight padding, no title row */
  compact?: boolean
}) {
  const renderLink = use(ListLinkContext)
  return (
    <section
      aria-label={title}
      className={cn(
        "relative flex h-full min-h-0 flex-col overflow-hidden rounded-[22px] bg-card shadow-xs",
        compact ? "p-[11px]" : "gap-2 p-4"
      )}
    >
      {compact ? null : (
        <h2 className="flex items-center justify-between text-footnote font-semibold text-muted-foreground uppercase">
          {href
            ? renderLink({ href, className: "min-h-8 py-1", children: title })
            : title}
        </h2>
      )}
      {/* a size container: content (DataView's inline states) adapts to the widget's width */}
      <div className="@container/widget min-h-0 flex-1 overflow-hidden">
        {children}
      </div>
    </section>
  )
}
