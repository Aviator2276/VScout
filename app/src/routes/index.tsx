import { createFileRoute } from "@tanstack/react-router"
import { Logo } from "@/components/icons/logo"
import { APP_VERSION } from "@/config/version"

export const Route = createFileRoute("/")({ component: Placeholder })

// Phase 0 placeholder. Home (features/home.md) replaces it in Phase 6; the tab shell in Phase 2.
function Placeholder() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-2 p-6 text-center">
      <Logo size="xl" decorative />
      <h1 className="font-heading text-large-title">VScout</h1>
      <p className="text-subhead text-muted-foreground">
        Version {APP_VERSION}
      </p>
    </main>
  )
}
