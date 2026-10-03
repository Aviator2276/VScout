// The tab screens' backgrounds (owner): soft gradients, shape artwork, and the team's own images,
// behind solid cards so text keeps its contrast. Chosen in Settings → Appearance and synced
// (userSettings.appBackground). AppBackdrop draws the chosen one; dark mode dims it like iOS dims
// the wallpaper.
//
// Ids: gradients by name ("aurora"), shapes as "shape:<file>", custom images as "custom:<file>".
// Shapes live in src/assets/backgrounds/shapes, custom images in src/assets/backgrounds/custom
// (see the README there): drop a file in and it appears in the picker. An id this build doesn't
// know (a file removed, or another device's newer build) shows no background.
import type { CSSProperties } from "react"

export type BackgroundGroup = "Gradients" | "Shapes" | "Custom"

export interface AppBackgroundDef {
  id: string
  label: string
  group: BackgroundGroup | null
  style: CSSProperties | null
  /** artwork is dimmed in dark mode; the gradients have their own dark versions */
  dims: boolean
}

const GRADIENTS = ["aurora", "sunset", "ocean", "mint", "graphite"] as const

const SHAPE_FILES = import.meta.glob<string>(
  "/src/assets/backgrounds/shapes/*.svg",
  { eager: true, query: "?url", import: "default" }
)
const CUSTOM_FILES = import.meta.glob<string>(
  "/src/assets/backgrounds/custom/*.{svg,png,jpg,jpeg,webp,avif}",
  { eager: true, query: "?url", import: "default" }
)

/** "team-photo_2.jpg" → "Team Photo 2" */
export function labelFromFile(path: string): string {
  const name =
    path
      .split("/")
      .pop()
      ?.replace(/\.[^.]+$/, "") ?? path
  return name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

const baseName = (path: string) =>
  path
    .split("/")
    .pop()
    ?.replace(/\.[^.]+$/, "") ?? path

const image = (url: string): CSSProperties => ({
  backgroundImage: `url("${url}")`,
  backgroundSize: "cover",
  backgroundPosition: "center",
})

const files = (
  glob: Record<string, string>,
  prefix: "shape" | "custom",
  group: BackgroundGroup
): Array<AppBackgroundDef> =>
  Object.entries(glob)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, url]) => ({
      id: `${prefix}:${baseName(path)}`,
      label: labelFromFile(path),
      group,
      style: image(url),
      dims: true,
    }))

export const NO_BACKGROUND: AppBackgroundDef = {
  id: "none",
  label: "None",
  group: null,
  style: null,
  dims: false,
}

export const APP_BACKGROUNDS: ReadonlyArray<AppBackgroundDef> = [
  NO_BACKGROUND,
  ...GRADIENTS.map((id) => ({
    id,
    label: id.charAt(0).toUpperCase() + id.slice(1),
    group: "Gradients" as const,
    // the gradients are CSS variables in styles.css (light and dark versions)
    style: { backgroundImage: `var(--app-bg-${id})` },
    dims: false,
  })),
  ...files(SHAPE_FILES, "shape", "Shapes"),
  ...files(CUSTOM_FILES, "custom", "Custom"),
]

export function appBackground(id: string | undefined): AppBackgroundDef {
  return APP_BACKGROUNDS.find((b) => b.id === id) ?? NO_BACKGROUND
}
