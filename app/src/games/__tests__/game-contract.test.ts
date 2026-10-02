// Every game module must pass this suite (game-module.md §8). It runs over the registered seasons
// and the fixture test game.
import { statSync } from "node:fs"
import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { game as testGame } from "../__fixtures__/test-game/definition"
import { allFields, conditionFields, isVisible } from "../kit/fields"
import { runMigrations } from "../kit/migrate"
import { deriveFormSchema } from "../kit/schema"
import { gameRegistry } from "../registry"
import type {
  CompLevelScope,
  FieldDef,
  FormDef,
  GameDefinition,
  LabelKey,
  MetricInput,
  OptionDef,
  ScouterLevel,
} from "../types"

const registered = await Promise.all(
  Object.values(gameRegistry).map((load) => load())
)
const games: Array<GameDefinition> = [...registered, testGame]

const LEVELS: Array<ScouterLevel> = ["new", "experienced"]
const STAGES: Array<CompLevelScope> = ["qual", "playoff"]
const REQUIRED_METRICS = [
  "reliability",
  "consistency",
  "defense",
  "autoEffectiveness",
]

function forms(game: GameDefinition): Array<FormDef> {
  return [game.matchForm, game.pitForm, game.postForm]
}

function fieldLabels(f: FieldDef): Array<LabelKey> {
  const keys: Array<LabelKey> = [f.label]
  if (f.help) keys.push(f.help)
  const opts = (o: ReadonlyArray<OptionDef>) => o.map((x) => x.label)
  switch (f.kind) {
    case "choice":
    case "multiChoice":
      keys.push(...opts(f.options))
      break
    case "boolean":
      if (f.trueLabel) keys.push(f.trueLabel)
      if (f.falseLabel) keys.push(f.falseLabel)
      break
    case "rating":
      keys.push(f.anchors.low, f.anchors.high)
      if (f.anchors.mid) keys.push(f.anchors.mid)
      break
    case "duration":
      keys.push(...f.buckets.map((b) => b.label))
      break
    case "fieldPosition":
      keys.push(...(f.zones ?? []).map((z) => z.label))
      break
    case "text":
      keys.push(...opts(f.quickTags ?? []))
      if (f.placeholder) keys.push(f.placeholder)
      break
    case "count":
    case "number":
    case "incidents":
      break
  }
  return keys
}

function referencedLabels(game: GameDefinition): Array<LabelKey> {
  const keys: Array<LabelKey> = [game.name]
  for (const p of game.phases) {
    keys.push(p.label)
    if (p.hint) keys.push(p.hint)
    keys.push(...(p.subPeriods ?? []).map((s) => s.label))
  }
  for (const form of forms(game))
    for (const s of form.sections) {
      keys.push(s.title)
      if (s.description) keys.push(s.description)
      for (const f of s.fields) keys.push(...fieldLabels(f))
    }
  const inc = game.incidents
  keys.push(
    ...inc.types.map((t) => t.label),
    ...inc.categories.map((c) => c.label),
    ...inc.lengths.map((l) => l.label),
    ...inc.resolutions.map((r) => r.label)
  )
  keys.push(...game.capabilities.map((c) => c.label))
  keys.push(...game.metrics.flatMap((m) => [m.label, m.description]))
  keys.push(...game.teamListColumns.map((c) => c.label))
  keys.push(...game.prematchCard.map((p) => p.title))
  keys.push(...Object.values(game.scoringKeys.units))
  keys.push(...Object.values(game.assets.images).map((i) => i.alt))
  return keys
}

/** A random valid value for a field (never null, so required fields are satisfied). */
function arbitraryFor(
  f: FieldDef,
  game: GameDefinition
): fc.Arbitrary<unknown> {
  const pick = (o: ReadonlyArray<{ value: string }>) =>
    fc.constantFrom(...o.map((x) => x.value))
  switch (f.kind) {
    case "choice":
      return pick(f.options)
    case "multiChoice":
      return fc.uniqueArray(pick(f.options), {
        minLength: 1,
        maxLength: Math.min(f.max ?? f.options.length, f.options.length),
      })
    case "boolean":
      return fc.boolean()
    case "count":
      return fc.integer({ min: f.min, max: f.max })
    case "number":
      return fc.integer({ min: f.min ?? 0, max: f.max ?? 1000 })
    case "rating":
      return fc.integer({ min: 1, max: f.scale })
    case "duration":
      return pick(f.buckets)
    case "fieldPosition":
      return f.mode === "zone"
        ? pick((f.zones ?? []).map((z) => ({ value: z.id })))
        : fc.record({
            x: fc.double({ min: 0, max: 1, noNaN: true }),
            y: fc.double({ min: 0, max: 1, noNaN: true }),
          })
    case "text":
      return fc.string({ minLength: 1, maxLength: Math.min(f.maxLength, 40) })
    case "incidents":
      return fc.array(
        fc.record({
          id: fc.uuid(),
          phase: fc.constantFrom(...game.incidents.phases),
          type: pick(game.incidents.types),
          category: pick(game.incidents.categories),
          length: pick(game.incidents.lengths),
          resolution: pick(game.incidents.resolutions),
          resolutionNote: fc.constant(null),
          note: fc.constant(null),
        }),
        { maxLength: 2 }
      )
  }
}

/** Random values for every applicable field, then hidden ones removed in form order. */
function arbitraryEntry(
  game: GameDefinition,
  form: FormDef,
  level: ScouterLevel
) {
  const fields = allFields(form).filter(
    (f) => !f.modes || f.modes.includes(level)
  )
  return fc
    .record(
      Object.fromEntries(fields.map((f) => [f.id, arbitraryFor(f, game)]))
    )
    .map((raw) => {
      const data: Record<string, unknown> = {}
      for (const f of fields) {
        const value = (raw as Record<string, unknown>)[f.id]
        if (isVisible(f, { ...data, [f.id]: value })) data[f.id] = value
      }
      return data
    })
}

const emptyInput: MetricInput = {
  teamNumber: 1,
  window: "all",
  matches: [],
  entries: [],
  allianceRanks: [],
  pit: null,
  post: [],
  external: null,
  weights: {},
}

describe.each(games.map((g) => [g.id, g] as const))(
  "game module %s",
  (_id, game) => {
    it("has unique field ids across forms and unique option values per field", () => {
      const ids = forms(game).flatMap((f) => allFields(f).map((x) => x.id))
      expect(new Set(ids).size).toBe(ids.length)
      for (const f of forms(game).flatMap(allFields)) {
        if (f.kind === "choice" || f.kind === "multiChoice") {
          const values = f.options.map((o) => o.value)
          expect(new Set(values).size, f.id).toBe(values.length)
        }
      }
    })

    it("has a label for every referenced key", () => {
      const missing = referencedLabels(game).filter(
        (k) => !(k in game.labels.en)
      )
      expect(missing).toEqual([])
    })

    it("only makes fields depend on earlier fields of the same form", () => {
      for (const form of forms(game)) {
        const seen = new Set<string>()
        for (const f of allFields(form)) {
          if (f.visibleWhen)
            for (const dep of conditionFields(f.visibleWhen))
              expect(seen, `${f.id} → ${dep}`).toContain(dep)
          seen.add(f.id)
        }
      }
    })

    it("has phase durations that add up to the match length", () => {
      const total = game.phases.reduce(
        (sum, p) => sum + (p.durationSec ?? 0),
        0
      )
      expect(total).toBe(game.match.totalSec)
    })

    it.each(
      LEVELS.flatMap((level) => STAGES.map((stage) => [level, stage] as const))
    )(
      "builds a schema for %s / %s that accepts generated entries",
      (level, stage) => {
        for (const form of forms(game)) {
          const schema = deriveFormSchema(game, form, { level, stage })
          fc.assert(
            fc.property(arbitraryEntry(game, form, level), (entry) => {
              const r = schema.safeParse(entry)
              if (!r.success) throw new Error(`${form.id}: ${r.error.message}`)
            }),
            { numRuns: 40 }
          )
        }
      }
    )

    it("has the required metrics, null on empty input and deterministic", () => {
      const ids = game.metrics.map((m) => m.id)
      expect(ids).toEqual(expect.arrayContaining(REQUIRED_METRICS))
      for (const m of game.metrics) {
        expect(m.compute(emptyInput).value, m.id).toBeNull()
        expect(m.compute(emptyInput)).toEqual(m.compute(emptyInput))
      }
    })

    it("has a migration for every older schema version", () => {
      for (let v = 1; v < game.schemaVersion; v++)
        expect(game.migrations[v], `v${v}`).toBeTypeOf("function")
      expect(runMigrations(game, {}, 1).schemaVersion).toBe(game.schemaVersion)
    })

    it("maps external enums only onto real options of the validated fields", () => {
      const fields = new Map(
        forms(game)
          .flatMap(allFields)
          .map((f) => [f.id, f])
      )
      for (const v of game.validations) {
        const field = fields.get(v.matchField)
        expect(field?.kind, v.matchField).toBe("choice")
        const def = game.scoringKeys.tba.perRobot[v.tbaPerRobot]
        expect(def, v.tbaPerRobot).toBeDefined()
      }
      for (const [name, map] of Object.entries(game.scoringKeys.enumMaps)) {
        const users = game.validations.filter(
          (v) => game.scoringKeys.tba.perRobot[v.tbaPerRobot]?.enumMap === name
        )
        const options = new Set(
          users.flatMap((v) => {
            const f = fields.get(v.matchField)
            return f?.kind === "choice" ? f.options.map((o) => o.value) : []
          })
        )
        if (users.length === 0) continue
        for (const value of Object.values(map))
          if (value !== null)
            expect(options, `${name} → ${value}`).toContain(value)
      }
    })

    it("has asset files under the size budget", () => {
      for (const [key, img] of Object.entries(game.assets.images)) {
        const url = new URL(`../${game.id}/${img.src}`, import.meta.url)
        expect(statSync(url).size, key).toBeLessThan(150 * 1024)
      }
    })

    it("declares banned terms and valid event overrides", () => {
      expect(game.bannedTerms.length).toBeGreaterThan(0)
      for (const [type, overrides] of Object.entries(game.defaultsByEventType))
        expect(
          game.eventOverridesSchema.safeParse(overrides).success,
          type
        ).toBe(true)
    })
  }
)
