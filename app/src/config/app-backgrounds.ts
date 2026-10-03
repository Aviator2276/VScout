// The tab screens' backgrounds (owner): soft Apple-like gradients behind the solid cards, so text
// keeps its contrast. The look lives in styles.css (`[data-app-bg]`); this is the list and names.
// The synced setting (userSettings.appBackground) validates against these ids.
export const APP_BACKGROUND_IDS = [
  "none",
  "aurora",
  "sunset",
  "ocean",
  "mint",
  "graphite",
] as const

export type AppBackground = (typeof APP_BACKGROUND_IDS)[number]

const LABEL: Record<AppBackground, string> = {
  none: "None",
  aurora: "Aurora",
  sunset: "Sunset",
  ocean: "Ocean",
  mint: "Mint",
  graphite: "Graphite",
}

export const APP_BACKGROUNDS: ReadonlyArray<{
  id: AppBackground
  label: string
}> = APP_BACKGROUND_IDS.map((id) => ({ id, label: LABEL[id] }))
