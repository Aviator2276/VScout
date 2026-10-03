import { renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { game } from "@/games/__fixtures__/test-game/definition"
import { createTestRuntime } from "@/testing/data-runtime"
import { toDomain } from "@/testing/factories/records"
import { TEST_EVENT, wireMatch } from "@/testing/factories/wire"
import { useBriefing } from "../api/get-briefing"
import { summarizeField } from "../utils/field-summary"

describe("pre-match strategy (scout-tab.md C)", () => {
  it("orders opponents first, then partners, then us", async () => {
    const t = createTestRuntime()
    await t.seedScope(`event:${TEST_EVENT}`, "match")
    await t.db.matches.put(
      toDomain(
        "match",
        wireMatch({
          matchNumber: 20,
          alliances: {
            red: { teamNumbers: [2276, 254, 1678], surrogates: [], dqs: [] },
            blue: { teamNumbers: [971, 118, 4414], surrogates: [], dqs: [] },
          },
        })
      )
    )
    const { result } = renderHook(
      () => useBriefing(TEST_EVENT, `${TEST_EVENT}_qm20`, 2276),
      {
        wrapper: t.wrapper,
      }
    )
    await vi.waitFor(() => expect(result.current.status).toBe("success"))
    const b = result.current.status === "success" ? result.current.data : null
    expect(b?.ourAlliance).toBe("red")
    expect(b?.teams.map((x) => [x.teamNumber, x.side])).toEqual([
      [971, "opponent"],
      [118, "opponent"],
      [4414, "opponent"],
      [254, "partner"],
      [1678, "partner"],
      [2276, "us"],
    ])
  })

  it("summarizes a field: most common answer with its count, latest, and tags", () => {
    const entries = [
      { data: { "teleop.role": "offense" }, tags: ["fast"], createdAt: 1 },
      { data: { "teleop.role": "defense" }, tags: [], createdAt: 2 },
      { data: { "teleop.role": "offense" }, tags: ["slow"], createdAt: 3 },
    ]
    expect(summarizeField(game, "teleop.role", "mode", entries)).toMatch(
      /\(2 of 3\)$/
    )
    expect(
      summarizeField(game, "teleop.role", "latest", entries)
    ).not.toBeNull()
    expect(summarizeField(game, "teleop.role", "tags", entries)).toBe(
      "fast, slow"
    )
    expect(summarizeField(game, "nope", "mode", entries)).toBeNull()
  })
})
