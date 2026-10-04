import { afterEach, describe, expect, it, vi } from "vitest"
import {
  PREPAINT_SCRIPT,
  applyTheme,
  rememberBackground,
  rememberTheme,
  resolveDark,
} from "../theme"

afterEach(() => {
  document.documentElement.className = ""
  delete document.documentElement.dataset.surfaces
  delete document.documentElement.dataset.splashDims
  document.documentElement.style.removeProperty("--splash-bg")
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

  describe("the splash shows the chosen background (owner, 2026-10-03)", () => {
    const runPrepaint = () => {
      vi.stubGlobal("matchMedia", () => ({ matches: false }))
      ;(new Function(PREPAINT_SCRIPT) as () => void)()
    }
    const root = document.documentElement

    it("Given a gradient was chosen, when the app launches, then the splash paints it before React runs", () => {
      rememberBackground(localStorage, {
        image: "var(--app-bg-aurora)",
        dims: false,
      })
      runPrepaint()
      expect(root.style.getPropertyValue("--splash-bg")).toBe(
        "var(--app-bg-aurora)"
      )
      expect(root.dataset.splashDims).toBeUndefined()
    })

    it("Given artwork was chosen, then the splash gets it and dims it in dark mode like the backdrop", () => {
      rememberBackground(localStorage, {
        image: 'url("/assets/waves-abc123.svg")',
        dims: true,
      })
      runPrepaint()
      expect(root.style.getPropertyValue("--splash-bg")).toBe(
        'url("/assets/waves-abc123.svg")'
      )
      expect(root.dataset.splashDims).toBe("")
    })

    it("Given no background (or it was turned off), then the splash stays plain", () => {
      rememberBackground(localStorage, {
        image: "var(--app-bg-ocean)",
        dims: false,
      })
      rememberBackground(localStorage, null)
      expect(localStorage.getItem("vscout.splashBg")).toBeNull()
      runPrepaint()
      expect(root.style.getPropertyValue("--splash-bg")).toBe("")
    })

    it("Given a damaged saved value or blocked storage, then the splash stays plain and nothing throws", () => {
      localStorage.setItem("vscout.splashBg", "{not json")
      runPrepaint()
      expect(root.style.getPropertyValue("--splash-bg")).toBe("")
      expect(root.className).toBe("k-ios")
      const blocked = {
        setItem: () => {
          throw new Error("blocked")
        },
        removeItem: () => {
          throw new Error("blocked")
        },
      } as unknown as Storage
      expect(() =>
        rememberBackground(blocked, { image: "x", dims: false })
      ).not.toThrow()
    })
  })
})
