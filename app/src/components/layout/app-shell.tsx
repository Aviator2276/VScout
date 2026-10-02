// Konsta's iOS theme context and safe-area variables (ui-design-system §8). Document scroll: no
// Konsta Page scroller.
import { App } from "konsta/react"
import type { ReactNode } from "react"

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <App theme="ios" safeAreas className="min-h-dvh bg-background">
      {children}
    </App>
  )
}
