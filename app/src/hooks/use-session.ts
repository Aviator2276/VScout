// The current session for React (routing-auth §8.3), from the auth client's external store.
import { useSyncExternalStore } from "react"
import type { AuthClient } from "@/lib/auth/auth-client"
import type { Session } from "@/lib/auth/types"

export function useSession(
  auth: Pick<AuthClient, "subscribe" | "getSession">
): Session | null {
  return useSyncExternalStore(auth.subscribe, auth.getSession, () => null)
}
