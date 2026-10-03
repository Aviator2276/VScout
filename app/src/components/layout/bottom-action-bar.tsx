// A page's primary action in the thumb zone (ui-patterns §4, HIG iOS: "Middle or lower controls tend
// to be easier to reach"). It floats above the tab bar and follows it down when the bar hides on
// scroll. A spacer keeps the page's last rows from sitting under it.
import type { ReactNode } from "react"
import { useTabBarHidden } from "@/hooks/use-tab-bar"
import { cn } from "@/lib/utils"

export function BottomActionBar({
  label,
  children,
}: {
  /** names the region for screen readers ("Team actions") */
  label: string
  children: ReactNode
}) {
  const tabBarHidden = useTabBarHidden()
  return (
    <>
      <div aria-hidden className="h-16" />
      <div
        role="region"
        aria-label={label}
        className={cn(
          // the tab bar is 56 pt tall with 16 pt under it; sit 8 pt above it
          "pointer-events-none fixed inset-x-0 bottom-[calc(var(--k-safe-area-bottom,0px)+80px)] z-20 flex justify-center px-safe-4 transition-[translate] duration-[380ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
          tabBarHidden && "translate-y-16"
        )}
      >
        <div className="pointer-events-auto flex w-full max-w-md gap-2">
          {children}
        </div>
      </div>
    </>
  )
}
