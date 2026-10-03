import { describe, expect, it } from "vitest"
import {
  APP_BACKGROUNDS,
  appBackground,
  labelFromFile,
} from "../app-backgrounds"
import { userSettingsDocument } from "@/lib/contracts/user-settings"

describe("app backgrounds (owner)", () => {
  it("has gradients and the shape files, each with a unique id", () => {
    const ids = APP_BACKGROUNDS.map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain("aurora")
    expect(ids).toContain("shape:bubbles")
    expect(
      APP_BACKGROUNDS.filter((b) => b.group === "Shapes").length
    ).toBeGreaterThanOrEqual(6)
  })

  it("unknown ids (a removed custom image, a newer build) show no background", () => {
    expect(appBackground("custom:gone").id).toBe("none")
    expect(appBackground(undefined).style).toBeNull()
    expect(appBackground("shape:waves").dims).toBe(true)
  })

  it("labels come from file names", () => {
    expect(labelFromFile("/x/custom/team-photo_2.jpg")).toBe("Team Photo 2")
  })

  it("the synced setting keeps any id, so a custom image survives an older build", () => {
    const parsed = userSettingsDocument.safeParse({
      appBackground: "custom:pit-crew",
    })
    expect(parsed.success && parsed.data.appBackground).toBe("custom:pit-crew")
  })
})
