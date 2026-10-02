// Motion at the root: lazy, async-loaded features (strict: the heavy `motion.*` components are banned) and
// reduced motion following the OS setting (ui-design-system §10.2–10.3).
import { LazyMotion, MotionConfig } from "motion/react"
import type { ReactNode } from "react"

// split out of the main bundle; `m.*` components animate once it arrives
const loadFeatures = () => import("./motion-features").then((m) => m.default)

export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  )
}
