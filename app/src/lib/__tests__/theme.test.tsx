import { afterEach, describe, expect, it, vi } from "vitest"
import {
  PREPAINT_SCRIPT,
  applyTheme,
  rememberTheme,
  resolveDark,
} from "../theme"

afterEach(() => {
  document.documentElement.className = ""
  delete document.documentElement.dataset.surfaces
  document.head.innerHTML = ""
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe("theme", () => {
  it("resolves system, light and dark", () => {
    expect(resolveDark("system", true)).toBe(true)
    expect(resolveDark("system", false)).toBe(false)
    expect(resolveDark("light", true)).toBe(false)
    expect(resolveDark("dark", false)).toBe(true)
  })

  it("applies classes, solid surfaces and theme-color to the document", () => {
    document.head.innerHTML =
      '<meta name="theme-color" content="#ffffff"><meta name="theme-color" content="#0a0a0a">'
    applyTheme(document, {
      preference: "dark",
      systemDark: false,
      solidSurfaces: true,
    })
    expect(document.documentElement.className).toBe("dark k-ios")
    expect(document.documentElement.dataset.surfaces).toBe("solid")
    expect(
      [...document.querySelectorAll("meta")].map((m) => m.content)
    ).toEqual(["#0a0a0a", "#0a0a0a"])
    applyTheme(document, {
      preference: "system",
      systemDark: false,
      solidSurfaces: false,
    })
    expect(document.documentElement.classList.contains("dark")).toBe(false)
    expect(document.documentElement.dataset.surfaces).toBeUndefined()
  })

  it("the pre-paint script applies the saved theme before React runs", () => {
    localStorage.setItem("vscout.theme", "system")
    localStorage.setItem("vscout.surfaces", "solid")
    vi.stubGlobal("matchMedia", () => ({ matches: true }))
    // the same string the root route inlines
    ;(new Function(PREPAINT_SCRIPT) as () => void)()
    expect(document.documentElement.className).toBe("dark k-ios")
    expect(document.documentElement.dataset.surfaces).toBe("solid")
  })

  it("remembers the setting and survives blocked storage", () => {
    rememberTheme(localStorage, "light", true)
    expect([
      localStorage.getItem("vscout.theme"),
      localStorage.getItem("vscout.surfaces"),
    ]).toEqual(["light", "solid"])
    const blocked = {
      setItem: () => {
        throw new Error("blocked")
      },
    } as unknown as Storage
    expect(() => rememberTheme(blocked, "dark", false)).not.toThrow()
  })
})
