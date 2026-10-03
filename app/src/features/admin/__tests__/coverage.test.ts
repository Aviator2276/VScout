import { describe, expect, it } from "vitest"
import { coverageSummary } from "../utils/coverage"

describe("coverage (features/admin.md AD4, criterion 11)", () => {
  it("counts covered robots and lists the missing ones", () => {
    const s = coverageSummary(
      [
        { key: "e_qm1", label: "Q1", teams: [1, 2, 3, 4, 5, 6] },
        { key: "e_qm12", label: "Q12", teams: [1, 2, 3, 4, 5, 6] },
      ],
      new Map([
        ["e_qm1", [1, 1, 1, 1, 1, 2] as const],
        ["e_qm12", [1, 0, 1, 1, 1, 1] as const],
      ])
    )
    expect(s.robots).toBe(12)
    expect(s.covered).toBe(11)
    expect(s.percent).toBe(92)
    expect(s.rows.find((r) => r.key === "e_qm12")?.missing).toBe(1)
  })

  it("nothing played: no percentage", () => {
    expect(coverageSummary([], new Map()).percent).toBeNull()
  })
})
