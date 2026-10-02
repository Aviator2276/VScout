// The in-app ask before the one OS permission prompt (push-notifications.md §2.2). Turn On calls
// the permission request first thing in the tap handler (WebKit drops the gesture after an await).
import { Button } from "@/components/controls/button"
import { Sheet } from "@/components/overlays/sheet"

export function PushPrePrompt({
  open,
  reason,
  onEnable,
  onNotNow,
}: {
  open: boolean
  /** one line on why now ("Get notified when someone messages you") */
  reason: string
  onEnable: () => void
  onNotNow: () => void
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) onNotNow()
      }}
    >
      <Sheet.Content title="Turn On Notifications" description={reason}>
        <div className="flex flex-col gap-2 pt-2">
          <Button size="large" onClick={onEnable}>
            Turn On Notifications
          </Button>
          <Button size="large" variant="plain" onClick={onNotNow}>
            Not Now
          </Button>
        </div>
      </Sheet.Content>
    </Sheet>
  )
}
