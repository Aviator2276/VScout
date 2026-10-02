import { describe, expect, it } from "vitest"
import { game as testGame } from "@/games/__fixtures__/test-game/definition"
import { allFields } from "@/games/kit/fields"
import { entriesCsv } from "../utils/export-csv"

describe("entries CSV (features/admin.md AD7, criterion 14)", () => {
  it("one row per entry under a label row and an id row; quotes and formulas are safe", () => {
    const fields = allFields(testGame.matchForm)
    const first = fields[0]
    if (!first) throw new Error("test game has no fields")
    const csv = entriesCsv(testGame, [
      {
        id: "e1",
        matchKey: "2026casj_qm1",
        teamNumber: 254,
        station: "red1",
        authorName: 'Sam "the scout"',
        createdAt: Date.UTC(2026, 2, 20),
        data: { [first.id]: "=cmd()" },
      },
    ])
    const lines = csv.trimEnd().split("\r\n")
    expect(lines).toHaveLength(3)
    expect(lines[0]).toMatch(/^Match,Team,Station,Scouter,Saved,/)
    expect(lines[1]).toContain(first.id)
    expect(lines[2]).toContain('"Sam ""the scout"""')
    expect(lines[2]).toContain("'=cmd()")
  })
})
