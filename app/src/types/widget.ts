// Home widget metadata (features/home.md H5). Shared type: each owning feature declares its widget's
// sizes and roles; the app layer puts the registry together.
import type { ZodType } from "zod"

export type WidgetSizes =
  | { kind: "fixed"; sizes: ReadonlyArray<readonly [w: number, h: number]> }
  | { kind: "range"; minW: number; maxW: number; minH: number; maxH: number }

export type WidgetRole = "admin" | "scouter" | "guest"

/** A per-widget setting the Edit Widget sheet shows (owner: clock seconds, rankings rows…). */
export type WidgetSetting =
  | { kind: "toggle"; key: string; label: string; default: boolean }
  | {
      kind: "count"
      key: string
      label: string
      min: number
      max: number
      default: number
    }

/** Widget tints (synced with the layout); `undefined` is the plain card. */
export const WIDGET_COLORS = [
  "blue",
  "green",
  "orange",
  "red",
  "purple",
  "teal",
  "indigo",
] as const
export type WidgetColor = (typeof WIDGET_COLORS)[number]

export interface WidgetMeta<TConfig = unknown> {
  type: string
  title: string
  description: string
  sizes: WidgetSizes
  defaultSize: readonly [number, number]
  /** "2x2" → "Small" for the Edit Widget sheet */
  sizeLabels?: Readonly<Record<string, string>>
  configSchema?: ZodType<TConfig>
  settings?: ReadonlyArray<WidgetSetting>
  defaultConfig?: TConfig
  roles: ReadonlyArray<WidgetRole>
}

/** What every widget component receives (the grid supplies its current size). */
export interface WidgetProps {
  w: number
  h: number
  eventKey: string
  config?: Readonly<Record<string, unknown>>
}
