// The VScout logo (the robot-scope glyph, brand/README.md). Use it wherever the app introduces
// itself: login, the boot screen, About, empty first-run states. The app icon is generated
// separately (scripts/generate-icons.py).
import { cn } from "@/lib/utils"

const SIZES = { sm: 32, md: 64, lg: 96, xl: 128 } as const

export interface LogoProps {
  size?: keyof typeof SIZES
  /** decorative next to the visible name "VScout"; otherwise it's announced */
  decorative?: boolean
  className?: string
}

export function Logo({
  size = "md",
  decorative = false,
  className,
}: LogoProps) {
  const px = SIZES[size]
  return (
    <img
      src="/icons/logo-256.png"
      width={px}
      height={px}
      alt={decorative ? "" : "VScout"}
      {...(decorative ? { "aria-hidden": true } : {})}
      className={cn("select-none", className)}
      draggable={false}
      decoding="async"
    />
  )
}
