import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

const manifest = JSON.parse(
  readFileSync(
    new URL("../../public/manifest.webmanifest", import.meta.url),
    "utf8"
  )
) as Record<string, unknown> & {
  icons: Array<{ purpose: string; sizes: string }>
}

describe("web app manifest (pwa-offline.md §10.1)", () => {
  it("keeps a stable id and standalone display (iOS push needs it)", () => {
    expect(manifest.id).toBe("/")
    expect(manifest.display).toBe("standalone")
  })
  it("doesn't lock orientation (ADR-072: landscape for pit tablets)", () => {
    expect(manifest.orientation ?? "any").toBe("any")
  })
  it("has 192 and 512 icons and a maskable icon", () => {
    const sizes = manifest.icons.map((i) => `${i.sizes}:${i.purpose}`)
    expect(sizes).toEqual(
      expect.arrayContaining(["192x192:any", "512x512:any", "512x512:maskable"])
    )
  })
})
