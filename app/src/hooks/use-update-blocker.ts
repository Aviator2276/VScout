// Holds back app updates while `active` (pwa-offline §7.2): dirty scouting forms and critical
// in-flight operations call this.
import { useEffect } from "react"
import { updateGuard } from "@/lib/pwa/update-guard"

export function useUpdateBlocker(active: boolean): void {
  useEffect(() => (active ? updateGuard.block() : undefined), [active])
}
