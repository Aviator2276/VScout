// Global providers under the root route (project-structure: app/app-providers.tsx). Nothing here
// touches browser APIs at render, so the shell prerender stays safe.
import type { ReactNode } from "react"
import { AppShell } from "@/components/layout/app-shell"
import { ListLinkContext } from "@/components/list/list"
import { MotionProvider } from "@/components/motion/motion-provider"
import { ToastProvider } from "@/components/overlays/toaster"
import { renderRouterLink } from "./router-anchor"

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AppShell>
      <MotionProvider>
        <ToastProvider>
          <ListLinkContext value={renderRouterLink}>{children}</ListLinkContext>
        </ToastProvider>
      </MotionProvider>
    </AppShell>
  )
}
