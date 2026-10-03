// The Sync Status notch every StackPage shows at the top center (features/sync-status.md). The app
// shell provides it (signed in only); the page tells it whether its nav bar has slid in.
import { createContext } from "react"
import type { ReactNode } from "react"

export const ShellNotchContext = createContext<
  ((attached: boolean) => ReactNode) | null
>(null)
