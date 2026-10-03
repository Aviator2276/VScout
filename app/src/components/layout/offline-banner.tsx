// Shown under the nav bar while offline (ui-patterns §6: offline is an overlay, not a state).
import { WifiOff } from "@/components/icons/icon"
import { useOnline } from "@/hooks/use-online"

export function OfflineBanner() {
  const online = useOnline()
  if (online) return null
  return (
    <p
      role="status"
      className="mt-2 mx-safe-4 flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-footnote text-muted-foreground"
    >
      <WifiOff aria-hidden size={16} className="shrink-0" />
      You're offline. Changes are saved on this device and sync when you're back
      online.
    </p>
  )
}
