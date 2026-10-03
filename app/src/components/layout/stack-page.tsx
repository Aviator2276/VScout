// A pushed page (ui-design-system §8): a sticky glass nav bar under the status bar and a large
// title that hands off to the inline title once it scrolls away. Document scroll.
import { use, useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { getTabMemory } from "@/stores/tab-memory"
import { ShellBannersContext } from "./shell-banners"

export interface StackPageProps {
  title: string
  /** "large" for tab roots and most pages, "inline" for dense detail pages */
  titleMode?: "large" | "inline"
  /** a back button or a leading action */
  leading?: ReactNode
  trailing?: ReactNode
  /** under the nav bar: offline or sign-in banners */
  banner?: ReactNode
  children: ReactNode
}

export function StackPage({
  title,
  titleMode = "large",
  leading,
  trailing,
  banner,
  children,
}: StackPageProps) {
  const large = titleMode === "large"
  const shellBanners = use(ShellBannersContext)
  // the next page's Back button is labelled with this title (no router needed: this runs after
  // the navigation has committed, so the address is the page's own)
  useEffect(() => {
    getTabMemory().setTitle(location.pathname, title)
  }, [title])
  const titleRef = useRef<HTMLHeadingElement>(null)
  const [collapsed, setCollapsed] = useState(!large)

  useEffect(() => {
    const el = titleRef.current
    if (!large || !el || typeof IntersectionObserver === "undefined") return
    const io = new IntersectionObserver(
      ([entry]) => setCollapsed(!(entry?.isIntersecting ?? true)),
      { rootMargin: "-56px 0px 0px 0px" }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [large])

  return (
    <div className="flex min-h-dvh flex-col">
      <header
        className={cn(
          "sticky top-0 z-20 pt-safe transition-[background-color,box-shadow] duration-200",
          // transparent at rest so a tab background shows; glass once content scrolls under it
          collapsed ? "rounded-none glass-bar" : "bg-transparent"
        )}
      >
        <div className="mx-auto grid min-h-11 w-full max-w-3xl grid-cols-[1fr_auto_1fr] items-center gap-2 px-safe-4">
          <div className="flex justify-start">{leading}</div>
          <p
            aria-hidden={large}
            className={cn(
              "truncate text-headline transition-opacity duration-200",
              collapsed ? "opacity-100" : "opacity-0"
            )}
          >
            {title}
          </p>
          <div className="flex justify-end gap-1">{trailing}</div>
        </div>
      </header>
      {shellBanners}
      {banner}
      {/* a readable width on iPad and desktop; pushed pages start a little below the nav bar */}
      <main
        id="main"
        className={cn(
          "mx-auto w-full max-w-3xl flex-1 px-safe-4 pb-[calc(var(--k-safe-area-bottom)+96px)]",
          !large && "pt-3"
        )}
      >
        {large ? (
          <h1
            ref={titleRef}
            className="pt-1 pb-2 font-heading text-large-title"
          >
            {title}
          </h1>
        ) : (
          <h1 className="sr-only">{title}</h1>
        )}
        {children}
      </main>
    </div>
  )
}
