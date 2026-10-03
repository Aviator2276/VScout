// Settings → Notifications (push-notifications.md §2–§4, features/settings.md): this device's push
// state with what to do about it, then the categories (synced per user, ADR-033). Guests get one
// switch for announcements on this device (ADR-066).
import { Button } from "@/components/controls/button"
import { CountStepper } from "@/components/controls/count-stepper"
import { Segmented } from "@/components/controls/segmented"
import { List } from "@/components/list/list"
import type { UserSettingsDocument } from "@/lib/contracts/user-settings"
import type { PushState } from "@/lib/push/push-state"

type Prefs = UserSettingsDocument["notifications"]

const STATE_COPY: Record<PushState, { title: string; detail: string }> = {
  subscribed: {
    title: "On for this device",
    detail: "You’ll get the notifications chosen below.",
  },
  "can-prompt": {
    title: "Off",
    detail: "Turn them on to hear about messages and announcements.",
  },
  snoozed: {
    title: "Off",
    detail: "Turn them on to hear about messages and announcements.",
  },
  "needs-tap": {
    title: "Almost there",
    detail: "Tap Turn On once more to finish setting up.",
  },
  denied: {
    title: "Blocked",
    detail:
      "iPhone: Settings → Notifications → VScout → Allow Notifications. Android: long-press the app icon → App info → Notifications.",
  },
  "needs-install": {
    title: "Add VScout to your Home Screen first",
    detail:
      "In Safari: Share → Add to Home Screen, then open VScout from the icon. Notifications, offline storage and full screen only work there.",
  },
  unsupported: {
    title: "Not available",
    detail: "This browser can’t show notifications from VScout.",
  },
}

export function NotificationSettings({
  state,
  prefs,
  guest,
  onEnable,
  onDisable,
  onTest,
  onChange,
}: {
  state: PushState
  prefs: Prefs
  guest: boolean
  onEnable: () => void
  onDisable: () => void
  onTest: () => void
  onChange: (patch: Partial<Prefs>) => void
}) {
  const copy = STATE_COPY[state]
  const on = state === "subscribed"
  return (
    <div className="flex flex-col gap-2">
      <section aria-labelledby="push-state" className="rounded-2xl bg-card p-4">
        <h2 id="push-state" className="text-headline">
          {copy.title}
        </h2>
        <p className="mt-1 text-subhead text-muted-foreground">{copy.detail}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {state === "can-prompt" ||
          state === "snoozed" ||
          state === "needs-tap" ? (
            <Button onClick={onEnable}>Turn On</Button>
          ) : null}
          {on ? (
            <>
              <Button variant="secondary" onClick={onTest}>
                Send a Test
              </Button>
              <Button variant="plain" onClick={onDisable}>
                Turn Off on This Device
              </Button>
            </>
          ) : null}
        </div>
      </section>
      {guest ? null : (
        <>
          <List.Section
            title="Send me"
            footer="In the app’s notification list and as push notifications. These follow you to every device you sign in on."
          >
            <List.Toggle
              title="Announcements"
              checked={prefs.announcements}
              onCheckedChange={(announcements) => onChange({ announcements })}
            />
            <List.Toggle
              title="Direct messages"
              checked={prefs.directMessages}
              onCheckedChange={(directMessages) => onChange({ directMessages })}
            />
            <List.Toggle
              title="Our match is coming up"
              checked={prefs.ourMatchQueue}
              onCheckedChange={(ourMatchQueue) => onChange({ ourMatchQueue })}
            />
            <List.Toggle
              title="A watched team’s match is coming up"
              checked={prefs.watchedMatchQueue}
              onCheckedChange={(watchedMatchQueue) =>
                onChange({ watchedMatchQueue })
              }
            />
            <List.Toggle
              title="Our match results"
              checked={prefs.matchResults}
              onCheckedChange={(matchResults) => onChange({ matchResults })}
            />
          </List.Section>
          <section className="mt-4 flex flex-col gap-2">
            <h3 className="px-4 text-footnote text-muted-foreground uppercase">
              Event chat
            </h3>
            <Segmented
              label="Event chat"
              value={prefs.eventChat}
              onValueChange={(eventChat) => onChange({ eventChat })}
              options={[
                { value: "all", label: "Every Message" },
                { value: "mentions", label: "Mentions" },
                { value: "off", label: "Off" },
              ]}
            />
          </section>
          <section className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-card px-4 py-2">
            <span className="text-body">Minutes before a match</span>
            <CountStepper
              label="Minutes before a match"
              value={prefs.matchLeadMinutes}
              min={2}
              max={30}
              onValueChange={(matchLeadMinutes) =>
                onChange({ matchLeadMinutes })
              }
            />
          </section>
          <p className="px-4 text-footnote text-muted-foreground">
            Urgent announcements always come through while notifications are on.
          </p>
        </>
      )}
    </div>
  )
}
