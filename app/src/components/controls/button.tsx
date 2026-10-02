// The app's button (ui-design-system §6.4): 44 pt minimum, 56 pt for primary form actions (gloves).
// Wraps the shadcn button so features never import components/ui.
import type { ComponentProps } from "react"
import { Button as UiButton } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const VARIANTS = {
  primary: "default",
  secondary: "secondary",
  plain: "ghost",
  destructive: "destructive",
} as const

const SIZES = {
  regular: "min-h-11 px-4 text-body",
  large: "min-h-14 w-full px-5 text-headline",
} as const

export type ButtonProps = Omit<
  ComponentProps<typeof UiButton>,
  "variant" | "size"
> & {
  variant?: keyof typeof VARIANTS
  size?: keyof typeof SIZES
}

export function Button({
  variant = "primary",
  size = "regular",
  className,
  ...props
}: ButtonProps) {
  return (
    <UiButton
      variant={VARIANTS[variant]}
      className={cn("h-auto rounded-full", SIZES[size], className)}
      {...props}
    />
  )
}
