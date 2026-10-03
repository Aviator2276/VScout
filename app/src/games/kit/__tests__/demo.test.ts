import { describe, expect, it } from "vitest"
import { game as rebuilt } from "../../2026-rebuilt/definition"
import { game as testGame } from "../../__fixtures__/test-game/definition"
import { demoFormData, seededRng } from "../demo"
import { deriveFormSchema } from "../schema"

const CTX = { level: "experienced", stage: "qual" } as const

describe("demo form data (AD7a)", () => {
  for (const game of [rebuilt, testGame])
    for (const form of [game.matchForm, game.pitForm, game.postForm])
      it(`${game.id} ${form.id}: valid for 60 seeds and every skill`, () => {
        const schema = deriveFormSchema(game, form, CTX)
        for (let seed = 1; seed <= 60; seed++) {
          const data = demoFormData(
            form,
            CTX,
            seededRng(seed),
            (seed % 11) / 10
          )
          const result = schema.safeParse(data)
          expect(result.error?.issues ?? []).toEqual([])
        }
      })

  it("same seed, same data", () => {
    const a = demoFormData(rebuilt.matchForm, CTX, seededRng(7), 0.5)
    const b = demoFormData(rebuilt.matchForm, CTX, seededRng(7), 0.5)
    expect(a).toEqual(b)
  })
})
