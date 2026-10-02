// This device's own settings (features/settings.md "What stays on the device"): solid surfaces,
// haptics, keep screen awake, connection override. Never synced.
import { useCallback } from "react"
import { useDataRuntime } from "@/lib/db/react/data-runtime"
import { useLiveOr } from "@/lib/db/react/data-state-hooks"
import type { DeviceSettingsRow } from "@/lib/db/types"

export const DEFAULT_DEVICE: DeviceSettingsRow = {
  id: "device",
  solidSurfaces: false,
  haptics: true,
  iosHapticsExperiment: false,
  keepScreenAwake: false,
  autoDownloadVideos: false,
  transport: "auto",
}

export function useDeviceSettings(): DeviceSettingsRow {
  const { db } = useDataRuntime()
  return useLiveOr(
    async () => (await db.deviceSettings.get("device")) ?? DEFAULT_DEVICE,
    [],
    DEFAULT_DEVICE
  )
}

export function useSetDeviceSettings() {
  const { db } = useDataRuntime()
  return useCallback(
    (patch: Partial<Omit<DeviceSettingsRow, "id">>) =>
      db.transaction("rw", db.deviceSettings, async () => {
        const current =
          (await db.deviceSettings.get("device")) ?? DEFAULT_DEVICE
        await db.deviceSettings.put({ ...current, ...patch })
      }),
    [db]
  )
}
