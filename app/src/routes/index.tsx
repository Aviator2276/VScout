import { createFileRoute } from "@tanstack/react-router"
import { APP_VERSION } from "@/config/version"

export const Route = createFileRoute("/")({ component: Placeholder })

// Phase 0 placeholder. Home (features/home.md) replaces it in Phase 6; the tab shell in Phase 2.
function Placeholder() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="font-heading text-2xl">VScout</h1>
      <p className="text-sm text-muted-foreground">Version {APP_VERSION}</p>
    </main>
  )
}
