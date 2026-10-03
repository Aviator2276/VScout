// The chosen app background (owner), behind everything on the tab screens. It's one fixed layer
// under the page, so going to a pushed page fades it to the plain background instead of the new
// page covering it, and coming back fades it in. Dark mode dims artwork like iOS dims the wallpaper.
import { createPortal } from "react-dom"
import type { AppBackgroundDef } from "@/config/app-backgrounds"
import { cn } from "@/lib/utils"

export function AppBackdrop({
  background,
  visible,
}: {
  background: AppBackgroundDef
  visible: boolean
}) {
  if (!background.style || typeof document === "undefined") return null
  return createPortal(
    <div
      aria-hidden
      data-app-backdrop=""
      className={cn(
        "pointer-events-none fixed inset-0 -z-10 bg-background transition-opacity duration-[350ms] ease-out motion-reduce:transition-none",
        background.dims && "dark:brightness-[0.32] dark:saturate-[1.15]",
        visible ? "opacity-100" : "opacity-0"
      )}
      style={background.style}
    />,
    document.body
  )
}
