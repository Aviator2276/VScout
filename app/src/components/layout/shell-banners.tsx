// Session-wide banners (offline, sign in again, expiry) that every StackPage shows under its nav bar.
// The app shell provides the node; pages don't wire it themselves.
import { createContext } from "react"
import type { ReactNode } from "react"

export const ShellBannersContext = createContext<ReactNode>(null)
