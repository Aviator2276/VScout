// Haptic feedback (ui-design-system §11). Always duplicates visible feedback, never replaces it.
// Android: navigator.vibrate after a user gesture. iOS has no vibrate API; an optional experiment
// toggles a hidden <input switch> (iOS 18+, unofficial) behind a flag.
export type HapticKind = "selection" | "success" | "warning" | "error"

const PATTERNS: Record<HapticKind, number | Array<number>> = {
  selection: 8,
  success: [12, 40, 12],
  warning: [20, 60, 20],
  error: [30, 50, 30, 50, 30],
}

let enabled = true
let iosExperiment = false
let iosSwitch: HTMLInputElement | null = null

export function configureHaptics(opts: {
  enabled: boolean
  iosExperiment: boolean
}): void {
  enabled = opts.enabled
  iosExperiment = opts.iosExperiment
}

function iosTick(): void {
  if (typeof document === "undefined") return
  if (!iosSwitch) {
    const label = document.createElement("label")
    label.setAttribute("aria-hidden", "true")
    label.style.cssText =
      "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden"
    iosSwitch = document.createElement("input")
    iosSwitch.type = "checkbox"
    iosSwitch.setAttribute("switch", "")
    iosSwitch.tabIndex = -1
    label.append(iosSwitch)
    document.body.append(label)
  }
  iosSwitch.parentElement?.click()
}

export function haptic(kind: HapticKind): void {
  if (!enabled || typeof navigator === "undefined") return
  if (typeof navigator.vibrate === "function") {
    navigator.vibrate(PATTERNS[kind])
    return
  }
  if (iosExperiment) iosTick()
}
