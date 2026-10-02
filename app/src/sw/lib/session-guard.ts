// Shared-device guard (push-notifications.md §6.2): a push meant for another user, or arriving
// with nobody signed in, shows no title or body.
import { GENERIC } from "./read-push"
import type { ShownPush } from "./read-push"

export function guardPush(
  shown: ShownPush,
  sessionUid: string | null
): ShownPush {
  if (!shown.data) return shown
  if (sessionUid === null || shown.data.uid !== sessionUid) return GENERIC
  return shown
}
