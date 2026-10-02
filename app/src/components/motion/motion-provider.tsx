// Motion at the root: lazy features (strict: the heavy `motion.*` components are banned) and
// reduced motion following the OS setting (ui-design-system §10.2–10.3).
import { LazyMotion, MotionConfig, domMax } from "motion/react"
import type { ReactNode } from "react"

export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  )
}
