// Glass chrome (ui-design-system §7): tab bar, nav bar once scrolled, floating buttons, toasts.
// Never content. A variant, not a className on shadcn parts (tailwind-merge can drop `glass`).
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function Glass({
  shape = "panel",
  className,
  children,
}: {
  shape?: "panel" | "pill"
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        "glass text-foreground",
        shape === "pill" ? "rounded-full" : "rounded-2xl",
        className
      )}
    >
      {children}
    </div>
  )
}
