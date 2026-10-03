// A whole-screen state (not found, no access, unsupported season, boot failure): icon, title,
// one sentence, up to two actions. Centered, readable, and usable without the tab bar.
import type { ReactNode } from "react"
import type { LucideIcon } from "@/components/icons/icon"

export function FullPageMessage({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon
  title: string
  description: string
  /** the actions */
  children?: ReactNode
}) {
  return (
    <main className="py-safe flex min-h-dvh flex-col items-center justify-center gap-3 px-safe-4 text-center">
      <Icon aria-hidden size={48} className="text-muted-foreground" />
      <h1 className="font-heading text-title-2">{title}</h1>
      <p className="max-w-sm text-body text-muted-foreground">{description}</p>
      {children ? (
        <div className="mt-3 flex w-full max-w-xs flex-col gap-2">
          {children}
        </div>
      ) : null}
    </main>
  )
}
