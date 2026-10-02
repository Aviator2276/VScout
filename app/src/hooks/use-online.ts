import { useSyncExternalStore } from "react"
import { onlineStore } from "@/stores/connectivity"

export function useOnline(): boolean {
  return useSyncExternalStore(
    onlineStore.subscribe,
    onlineStore.getSnapshot,
    onlineStore.getServerSnapshot
  )
}
