// /dev/gallery search params: which page, and the appearance to render it in (ui-patterns: light,
// dark, solid surfaces, AX3 text). Playwright drives them through the URL.
import { z } from "zod"

export const GALLERY_PAGES = [
  "components",
  "states",
  "overlays",
  "form",
  "mqtt",
] as const

export const gallerySearch = z.object({
  show: z.enum(GALLERY_PAGES).default("components").catch("components"),
  theme: z.enum(["system", "light", "dark"]).default("system").catch("system"),
  surfaces: z.enum(["glass", "solid"]).default("glass").catch("glass"),
  text: z.enum(["default", "ax3"]).default("default").catch("default"),
})
export type GallerySearch = z.infer<typeof gallerySearch>
