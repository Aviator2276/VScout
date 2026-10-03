// demoFormData edge cases on a synthetic form: every field kind, missing bounds, zones, gates.
import { describe, expect, it } from "vitest"
import type { FieldDef, FormDef } from "../../types"
import { demoEntries, demoFormData, pick, seededRng } from "../demo"

const CTX = { level: "experienced", stage: "qual" } as const
const L = "x" as never
const always = (n: number) => () => n

function form(...fields: Array<FieldDef>): FormDef {
  return { id: "match", sections: [{ id: "s", title: L, fields }] }
}

describe("demo data edge cases (AD7a)", () => {
  it("pick refuses an empty list", () => {
    expect(() => pick(always(0), [])).toThrow(/empty list/)
  })

  it("numbers without bounds: the min when required, else null", () => {
    const data = demoFormData(
      form(
        { kind: "number", id: "a", label: L, required: true },
        { kind: "number", id: "b", label: L, required: true, min: 5 },
        { kind: "number", id: "c", label: L },
        { kind: "number", id: "d", label: L, min: 0, max: 10, integer: true },
        { kind: "number", id: "e", label: L, min: 0, max: 1 }
      ),
      CTX,
      always(0.33),
      0.5
    )
    expect(data).toEqual({ a: 1, b: 5, c: null, d: 3, e: 0.3 })
  })

  it("field positions: a zone id, null without zones, or a point", () => {
    const base = { label: L, image: "field" as never, mirrorForAlliance: false }
    const data = demoFormData(
      form(
        {
          kind: "fieldPosition",
          id: "z",
          mode: "zone",
          zones: [{ id: "near", label: L, polygon: [] }],
          ...base,
        },
        { kind: "fieldPosition", id: "none", mode: "zone", ...base },
        { kind: "fieldPosition", id: "p", mode: "point", ...base }
      ),
      CTX,
      always(0.5),
      0.5
    )
    expect(data).toEqual({ z: "near", none: null, p: { x: 0.5, y: 0.5 } })
  })

  it("text is filled only when required; incidents start empty", () => {
    const text = {
      kind: "text",
      label: L,
      multiline: false,
      maxLength: 20,
    } as const
    const data = demoFormData(
      form(
        { ...text, id: "req", required: { modes: ["experienced"] } },
        { ...text, id: "opt", required: { modes: ["new"] } },
        { kind: "incidents", id: "inc", label: L }
      ),
      CTX,
      always(0.5),
      0.5
    )
    expect(data).toEqual({ req: "Demo note", opt: null, inc: [] })
  })

  it("a required multi-choice never comes back empty", () => {
    const options = [
      { value: "a", label: L },
      { value: "b", label: L },
    ]
    const data = demoFormData(
      form(
        { kind: "multiChoice", id: "req", label: L, options, required: true },
        { kind: "multiChoice", id: "opt", label: L, options, max: 1 }
      ),
      CTX,
      always(0),
      0.5
    )
    expect(data).toEqual({ req: ["a"], opt: [] })
  })

  it("choices lean on tone: strong robots pick good, weak ones bad", () => {
    const options = [
      { value: "bad", label: L, tone: "bad" as const },
      { value: "meh", label: L, tone: "warn" as const },
      { value: "good", label: L, tone: "good" as const },
    ]
    const f = form({ kind: "choice", id: "c", label: L, options })
    expect(demoFormData(f, CTX, always(0), 1)).toEqual({ c: "bad" })
    expect(demoFormData(f, CTX, always(0.999), 1)).toEqual({ c: "good" })
    // no options: nothing to pick
    expect(
      demoFormData(
        form({ kind: "choice", id: "c", label: L, options: [] }),
        CTX,
        always(0.5),
        1
      )
    ).toEqual({ c: "" })
  })

  it("a gating choice usually takes the value that shows more of the form", () => {
    const f = form(
      {
        kind: "choice",
        id: "gate",
        label: L,
        options: [
          { value: "no", label: L, tone: "bad" },
          { value: "yes", label: L, tone: "good" },
        ],
      },
      {
        kind: "count",
        id: "shown",
        label: L,
        min: 0,
        max: 4,
        visibleWhen: { field: "gate", eq: "yes" },
      },
      {
        kind: "rating",
        id: "also",
        label: L,
        scale: 5,
        anchors: { low: L, high: L },
        visibleWhen: { field: "shown", truthy: true },
      }
    )
    // rng 0 → the weakest option "no", then the gate (0 < 0.9) flips it to "yes"
    expect(demoFormData(f, CTX, always(0), 0)).toMatchObject({ gate: "yes" })
    // rng ≥ 0.9 keeps the drawn value
    expect(demoFormData(f, CTX, always(0.95), 0)).toEqual({
      gate: "yes",
      shown: 1,
      also: 2,
    })
  })

  it("a gate that isn't a choice or boolean keeps its value", () => {
    const f = form(
      { kind: "count", id: "n", label: L, min: 0, max: 2 },
      {
        kind: "boolean",
        id: "b",
        label: L,
        visibleWhen: { field: "n", truthy: true },
      }
    )
    expect(demoFormData(f, CTX, always(0), 0)).toEqual({ n: 0 })
  })

  it("demoEntries builds all three forms from one generator", () => {
    const g = form({ kind: "boolean", id: "b", label: L })
    const entries = demoEntries(
      { matchForm: g, pitForm: g, postForm: g },
      seededRng(3),
      0.5
    )
    for (const make of [entries.match, entries.pit, entries.post])
      expect(typeof make().b).toBe("boolean")
  })
})
