// Theme: follow the system with an override (ADR-027/044). The synced userSettings.theme is mirrored
// to localStorage so an inline script can set `.dark` before first paint (no flash). Also sets the
// solid-surfaces fallback (iOS Reduce Transparency can't be detected, ui-design-system §7.3).
export type ThemePreference = "system" | "light" | "dark"

export const THEME_KEY = "vscout.theme"
export const SURFACES_KEY = "vscout.surfaces"

const META_LIGHT = "#ffffff"
const META_DARK = "#0a0a0a"

export function resolveDark(
  pref: ThemePreference,
  systemDark: boolean
): boolean {
  return pref === "dark" || (pref === "system" && systemDark)
}

/** Applies the theme to <html>; safe to call repeatedly (settings change, system change). */
export function applyTheme(
  doc: Document,
  opts: {
    preference: ThemePreference
    systemDark: boolean
    solidSurfaces: boolean
  }
): void {
  const root = doc.documentElement
  const dark = resolveDark(opts.preference, opts.systemDark)
  root.classList.toggle("dark", dark)
  root.classList.add("k-ios") // Konsta selectors must match inside portals (§9)
  if (opts.solidSurfaces) root.dataset.surfaces = "solid"
  else delete root.dataset.surfaces
  // an explicit choice overrides both media-specific theme-color metas
  if (opts.preference !== "system")
    for (const meta of doc.querySelectorAll<HTMLMetaElement>(
      'meta[name="theme-color"]'
    ))
      meta.content = dark ? META_DARK : META_LIGHT
}

/** Keeps the pre-paint mirror in step with the synced setting. */
export function rememberTheme(
  storage: Storage | undefined,
  pref: ThemePreference,
  solid: boolean
): void {
  try {
    storage?.setItem(THEME_KEY, pref)
    storage?.setItem(SURFACES_KEY, solid ? "solid" : "glass")
  } catch {
    // private mode or storage blocked: the theme still applies, it just may flash on next launch
  }
}

/** Inline in <head>, runs before first paint. Self-contained: no imports, no module scope. */
export const PREPAINT_SCRIPT = `(function(){try{var d=document.documentElement,t=localStorage.getItem("${THEME_KEY}")||"system",s=localStorage.getItem("${SURFACES_KEY}");var dark=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);if(dark)d.classList.add("dark");d.classList.add("k-ios");if(s==="solid")d.dataset.surfaces="solid"}catch(e){}})()`
