// Where push stands on this device (push-notifications.md §2.1). Pure: the browser facts and the
// prompt record go in, one state comes out. Unit-tested as a table.

export type PushState =
  /** iOS in a Safari tab or an in-app browser: install to the Home Screen first */
  | "needs-install"
  /** no service worker / PushManager / Notification (iOS < 16.4, some webviews) */
  | "unsupported"
  /** permission not asked yet, and the pre-prompt may be shown */
  | "can-prompt"
  /** permission not asked yet, but the user said "Not now" recently or too often */
  | "snoozed"
  /** granted, no subscription that works yet (iOS may need one more tap) */
  | "needs-tap"
  | "subscribed"
  | "denied"

export interface PushFacts {
  hasServiceWorker: boolean
  hasPushManager: boolean
  hasNotification: boolean
  ios: boolean
  standalone: boolean
  inAppBrowser: boolean
  permission: "default" | "granted" | "denied"
  subscribed: boolean
}

export interface PromptRecord {
  /** how many times "Not now" was chosen */
  dismissals: number
  lastDismissedAt: number | null
}

export const PROMPT_COOLDOWN_MS = 3 * 24 * 3_600_000
export const MAX_PROMPTS = 3

export function computeState(
  f: PushFacts,
  prompt: PromptRecord,
  now: number
): PushState {
  if (f.ios && (!f.standalone || f.inAppBrowser)) return "needs-install"
  if (!f.hasServiceWorker || !f.hasPushManager || !f.hasNotification)
    return "unsupported"
  if (f.permission === "denied") return "denied"
  if (f.permission === "granted")
    return f.subscribed ? "subscribed" : "needs-tap"
  const cooling =
    prompt.lastDismissedAt !== null &&
    now - prompt.lastDismissedAt < PROMPT_COOLDOWN_MS
  return prompt.dismissals >= MAX_PROMPTS || cooling ? "snoozed" : "can-prompt"
}

export function isIOS(
  ua: string,
  platform: string,
  maxTouchPoints: number
): boolean {
  return (
    /iPhone|iPad|iPod/.test(ua) ||
    (platform === "MacIntel" && maxTouchPoints > 1)
  )
}

export function isInAppBrowser(ua: string): boolean {
  return /FBAN|FBAV|Instagram|Discord|Slack|Line\//.test(ua)
}
