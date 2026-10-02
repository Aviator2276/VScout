// The device's push state for React, and the in-context pre-prompt (push-notifications.md §2.2).
import { useEffect, useState, useSyncExternalStore } from "react"
import type { PushState } from "@/lib/push/push-state"
import type { AppRuntime } from "./runtime"

export function usePushState(app: AppRuntime): PushState {
  const state = useSyncExternalStore(
    app.push.subscribe,
    app.push.getState,
    app.push.getState
  )
  useEffect(() => {
    void app.push.refresh()
  }, [app])
  return state
}

/** Opens the pre-prompt once per visit when the device may be asked. */
export function usePrePrompt(app: AppRuntime) {
  const state = usePushState(app)
  const [shown, setShown] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  if (state === "can-prompt" && !shown && !dismissed) setShown(true)
  return {
    open: shown && !dismissed && state === "can-prompt",
    // no await before enable(): it requests permission synchronously inside the tap
    enable: () => {
      setDismissed(true)
      void app.push.enable()
    },
    notNow: () => {
      setDismissed(true)
      void app.push.dismissPrompt()
    },
  }
}
