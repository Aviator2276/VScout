// A nav-bar icon button (HIG Toolbars): 44 pt, tinted, with an optional count badge (the Filter
// button shows how many filters are on). The badge is part of the accessible name.
import type { ReactNode } from "react"

export interface ToolbarButtonProps {
  label: string
  onClick: () => void
  children: ReactNode
  /** e.g. active filter count; hidden at 0 */
  badge?: number
  pressed?: boolean
}

export function ToolbarButton({
  label,
  onClick,
  children,
  badge = 0,
  pressed,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      aria-label={badge > 0 ? `${label}, ${badge} on` : label}
      aria-pressed={pressed}
      onClick={onClick}
      className="relative inline-flex size-11 items-center justify-center rounded-full text-primary active:opacity-60"
    >
      {children}
      {badge > 0 ? (
        <span
          aria-hidden
          className="absolute top-1 right-0.5 flex min-w-4.5 items-center justify-center rounded-full bg-primary px-1 text-caption-2 font-semibold text-primary-foreground tabular-nums"
        >
          {badge}
        </span>
      ) : null}
    </button>
  )
}
