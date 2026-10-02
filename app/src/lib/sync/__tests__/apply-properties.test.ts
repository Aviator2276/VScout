// Property (testing.md): whatever order and however many times changes arrive, the result is the
// highest revision (MQTT and HTTP may both deliver, in any order).
import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { change } from "@/testing/changes"
import { createDb } from "@/lib/db/db"
import { testGames } from "@/testing/db"
import { wireMatch } from "@/testing/factories/wire"
import { applyChanges } from "../apply-envelope"

let n = 0

describe("applyEnvelope properties", () => {
  it("converges to the highest rev for any delivery order with duplicates", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 1, max: 6 }), {
          minLength: 1,
          maxLength: 12,
        }),
        async (revs) => {
          const db = createDb(`prop-${++n}`)
          const ctx = {
            db,
            games: testGames,
            now: () => 0,
            newId: () => `id-${++n}`,
          }
          for (const rev of revs)
            await applyChanges(
              [
                change(
                  "match",
                  wireMatch({ rev, matchNumber: 1, setNumber: rev })
                ),
              ],
              ctx
            )
          const row = await db.matches.get("2026casj_qm1")
          await db.delete()
          const max = Math.max(...revs)
          expect(row).toMatchObject({ rev: max, setNumber: max })
        }
      ),
      { numRuns: 40 }
    )
  })
})
