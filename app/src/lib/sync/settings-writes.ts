// Preference writes (ADR-033, ADR-066). Scouters and admins: a merge patch on their synced
// userSettings document through the outbox (per-key last-writer-wins, data-layer §8). Guests: the
// same keys in deviceSettings.guestPrefs, local only, never an outbox op.
import { userSettingsDocument } from "@/lib/contracts/user-settings"
import type { UserSettingsDocument } from "@/lib/contracts/user-settings"
import type { DeviceSettingsRow, UserSettingsRecord } from "@/lib/db/types"
import type { MutateDeps } from "./mutate"
import { NotAllowedError } from "./errors"
import { enqueue } from "./outbox"

export type SettingsPatch = Partial<
  Pick<
    UserSettingsDocument,
    | "watchedTeams"
    | "teamListColumns"
    | "scouterLevel"
    | "theme"
    | "notifications"
    | "celebrate"
    | "dismissedTips"
    | "help"
    | "snippets"
    | "homeLayout"
    | "lastActiveEventKey"
  >
>

const DEFAULT_DOC: UserSettingsDocument = userSettingsDocument.parse({})

const DEFAULT_DEVICE: DeviceSettingsRow = {
  id: "device",
  solidSurfaces: false,
  haptics: true,
  iosHapticsExperiment: false,
  keepScreenAwake: false,
  autoDownloadVideos: false,
  transport: "auto",
}

/** The effective document: synced settings, or a guest's device prefs, over the defaults. */
export function settingsDocument(
  source: Record<string, unknown> | undefined
): UserSettingsDocument {
  const parsed = userSettingsDocument.safeParse(source ?? {})
  return parsed.success ? parsed.data : DEFAULT_DOC
}

export async function patchUserSettings(
  deps: MutateDeps,
  patch: SettingsPatch
): Promise<void> {
  const s = deps.session()
  if (!s) throw new NotAllowedError("Sign in to change settings")
  const { db } = deps
  const keys = Object.keys(patch)
  if (keys.length === 0) return
  await db.transaction("rw", [db.userSettings, db.outbox], async () => {
    const now = deps.clock.now()
    const current = await db.userSettings.get(s.userId)
    const next: UserSettingsRecord = {
      ...DEFAULT_DOC,
      id: s.userId,
      userId: s.userId,
      rev: 0,
      updatedAt: now,
      ...current,
      ...patch,
      syncState: "pending",
    }
    await db.userSettings.put(next)
    await enqueue(db, {
      opId: deps.ids.newId(),
      userId: s.userId,
      entity: "userSettings",
      recordId: s.userId,
      eventKey: null,
      kind: "update",
      patchKeys: keys,
      now,
    })
  })
  deps.onWrite?.()
}

/** Guests: preferences stay on this device (ADR-066, C3-1). */
export async function patchGuestPrefs(
  db: MutateDeps["db"],
  patch: SettingsPatch
): Promise<void> {
  await db.transaction("rw", db.deviceSettings, async () => {
    const current = (await db.deviceSettings.get("device")) ?? DEFAULT_DEVICE
    await db.deviceSettings.put({
      ...current,
      guestPrefs: { ...current.guestPrefs, ...patch },
    })
  })
}
