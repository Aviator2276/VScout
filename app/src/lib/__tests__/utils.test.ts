import { describe, expect, it } from "vitest"
import { TYPE_SCALE, cn } from "../utils"

describe("cn", () => {
  it("treats the iOS type scale as font sizes, not colors", () => {
    expect(cn("bg-primary text-primary-foreground", "text-body")).toBe(
      "bg-primary text-primary-foreground text-body"
    )
    for (const size of TYPE_SCALE)
      expect(cn("text-muted-foreground", `text-${size}`)).toBe(
        `text-muted-foreground text-${size}`
      )
  })

  it("keeps important type-scale sizes next to important colors", () => {
    expect(cn("min-h-11", "text-subhead! text-foreground!")).toBe(
      "min-h-11 text-subhead! text-foreground!"
    )
  })

  it("still merges conflicts within a group", () => {
    expect(cn("text-sm", "text-body")).toBe("text-body")
    expect(cn("text-headline", "text-footnote")).toBe("text-footnote")
    expect(cn("text-foreground", "text-destructive")).toBe("text-destructive")
    expect(cn("p-2", false, ["p-4"])).toBe("p-4")
  })
})

describe("generated shadcn files", () => {
  it('use the configured cn (the CLI writes `from "cn"`, which lint can\'t see in ui/)', async () => {
    const { readdirSync, readFileSync } = await import("node:fs")
    const dir = new URL("../../components/ui/", import.meta.url)
    const offenders = readdirSync(dir).filter((f) =>
      readFileSync(new URL(f, dir), "utf8").includes('from "cn"')
    )
    expect(offenders).toEqual([])
  })
})
