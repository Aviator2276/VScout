import { describe, expect, it } from "vitest"
import { game } from "@/games/2026-rebuilt/definition"
import { allFields } from "@/games/kit/fields"
import { t } from "@/games/kit/labels"
import type { FieldDef } from "@/games/types"
import type { ConflictRow } from "@/lib/db/types"
import { buildConflictView, entityName } from "../conflict-view"

function conflict(over: Partial<ConflictRow> = {}): ConflictRow {
  return {
    id: "c1",
    entity: "comment",
    recordId: "r1",
    eventKey: "2026test",
    kind: "rev-mismatch",
    source: "pull",
    detectedAt: 0,
    status: "open",
    local: null,
    remote: null,
    baseRev: 1,
    remoteRev: 2,
    blockedOpIds: [],
    ...over,
  }
}

const matchFields = allFields(game.matchForm)
function nth<T>(list: ReadonlyArray<T>, i: number): T {
  const item = list[i]
  if (item === undefined) throw new Error(`no item ${i}`)
  return item
}
function fieldOf<TKind extends FieldDef["kind"]>(kind: TKind) {
  const f = matchFields.find((x) => x.kind === kind)
  if (!f) throw new Error(`the match form has no ${kind} field`)
  return f as Extract<FieldDef, { kind: TKind }>
}

describe("entityName", () => {
  it("names known entities and passes unknown ones through", () => {
    expect(entityName("scoutEntry")).toBe("match scouting")
    expect(entityName("picklistEntry")).toBe("picklist entry")
    expect(entityName("mediaAsset")).toBe("photo")
    expect(entityName("somethingNew")).toBe("somethingNew")
  })
})

describe("buildConflictView (data-layer §11)", () => {
  it("titles with team, the labelled match and the entity", () => {
    const view = buildConflictView(
      conflict({
        entity: "scoutEntry",
        local: { teamNumber: 254, matchKey: "2026test_qm3", data: {} },
      }),
      game,
      { matchLabel: (k) => `Q${k.split("qm")[1]}` }
    )
    expect(view.title).toBe("Team 254 · Q3 · match scouting")
  })

  it("falls back to the raw match key and to the remote record", () => {
    const view = buildConflictView(
      conflict({
        entity: "pitScouting",
        remote: { teamNumber: 1678, matchKey: "2026test_qm9" },
      }),
      game
    )
    expect(view.title).toBe("Team 1678 · 2026test_qm9 · pit scouting")
  })

  it("titles with just the entity when there is no team or match", () => {
    expect(buildConflictView(conflict(), null).title).toBe("note")
  })

  it("lists the form's answers side by side with labels and formatted values", () => {
    const choice = fieldOf("choice")
    const multi = fieldOf("multiChoice")
    const optA = nth(choice.options, 0)
    const optB = nth(choice.options, 1)
    const multiFirst = nth(multi.options, 0)
    const mine = {
      [choice.id]: optA.value,
      [multi.id]: [multiFirst.value, "not-an-option"],
    }
    const theirs = { [choice.id]: optB.value, [multi.id]: mine[multi.id] }
    const view = buildConflictView(
      conflict({
        entity: "scoutEntry",
        local: { data: mine },
        remote: { data: theirs },
      }),
      game
    )
    const byPath = Object.fromEntries(view.fields.map((f) => [f.path, f]))
    expect(byPath[`data.${choice.id}`]).toEqual({
      path: `data.${choice.id}`,
      label: t(game, choice.label),
      mine: t(game, optA.label),
      theirs: t(game, optB.label),
      changed: true,
    })
    expect(byPath[`data.${multi.id}`]).toMatchObject({
      mine: `${t(game, multiFirst.label)}, not-an-option`,
      changed: false,
    })
    // fields neither side answered are left out
    expect(view.fields).toHaveLength(2)
  })

  it("formats missing, null, booleans, lists, objects and numbers", () => {
    // index a non-choice field so the generic formatting applies
    const plain = matchFields.filter(
      (f) => f.kind !== "choice" && f.kind !== "multiChoice"
    )
    const [a, b, c, d, e, f] = [0, 1, 2, 3, 4, 5].map((i) => nth(plain, i)) as [
      FieldDef,
      FieldDef,
      FieldDef,
      FieldDef,
      FieldDef,
      FieldDef,
    ]
    const mine = {
      [a.id]: null,
      [b.id]: true,
      [c.id]: [],
      [d.id]: [1, 2],
      [e.id]: { x: 1 },
      [f.id]: 7,
    }
    const theirs = { [a.id]: false, [c.id]: "text" }
    const view = buildConflictView(
      conflict({
        entity: "scoutEntry",
        local: { data: mine },
        remote: { data: theirs },
      }),
      game
    )
    const shown = Object.fromEntries(
      view.fields.map((x) => [x.path, [x.mine, x.theirs]])
    )
    expect(shown[`data.${a.id}`]).toEqual(["Didn’t see", "No"])
    expect(shown[`data.${b.id}`]).toEqual(["Yes", "—"])
    expect(shown[`data.${c.id}`]).toEqual(["None", "text"])
    expect(shown[`data.${d.id}`]).toEqual(["2 items", "—"])
    expect(shown[`data.${e.id}`]).toEqual(["…", "—"])
    expect(shown[`data.${f.id}`]).toEqual(["7", "—"])
  })

  it("shows the server side as null after a remote delete", () => {
    const choice = fieldOf("choice")
    const view = buildConflictView(
      conflict({
        entity: "postScouting",
        kind: "deleted-remotely",
        local: { data: { [choice.id]: nth(choice.options, 0).value } },
        remote: null,
      }),
      game
    )
    // the post form may not have this field; any listed field has no server side
    for (const f of view.fields) expect(f.theirs).toBeNull()
    expect(view.summary).toMatch(/deleted on the server/)
    expect(view.actions).toEqual(["keep-mine", "keep-theirs"])
  })

  it("lists the core fields for non-form entities, skipping team and match", () => {
    const view = buildConflictView(
      conflict({
        local: {
          body: "mine",
          visibility: "team",
          teamNumber: 254,
          matchKey: "m",
        },
        remote: { body: "theirs", visibility: "team" },
      }),
      null
    )
    expect(view.fields).toEqual([
      {
        path: "body",
        label: "Text",
        mine: "mine",
        theirs: "theirs",
        changed: true,
      },
      {
        path: "visibility",
        label: "Visibility",
        mine: "team",
        theirs: "team",
        changed: false,
      },
    ])
  })

  it("has no server side for core fields when the remote is gone", () => {
    const view = buildConflictView(
      conflict({ kind: "deleted-remotely", local: { emoji: "👍" } }),
      null
    )
    expect(view.fields).toEqual([
      {
        path: "emoji",
        label: "Reaction",
        mine: "👍",
        theirs: null,
        changed: true,
      },
    ])
  })

  it("skips form fields without a game", () => {
    const view = buildConflictView(
      conflict({ entity: "scoutEntry", local: { data: { x: 1 } } }),
      null
    )
    expect(view.fields).toEqual([])
  })

  it("picks the summary and actions for each conflict kind", () => {
    const of = (over: Partial<ConflictRow>) => {
      const v = buildConflictView(conflict(over), game)
      return [v.summary, v.actions]
    }
    expect(of({ kind: "rev-mismatch" })).toEqual([
      expect.stringMatching(/newer version/),
      ["keep-mine", "keep-theirs"],
    ])
    expect(of({ kind: "duplicate" })).toEqual([
      expect.stringMatching(/another device/),
      ["keep-mine", "keep-theirs"],
    ])
    expect(of({ kind: "forbidden" })).toEqual([
      expect.stringMatching(/not allowed/),
      ["discard"],
    ])
    expect(of({ kind: "rejected" })).toEqual([
      "The server didn’t accept this change.",
      ["discard"],
    ])
    expect(
      of({
        kind: "rejected",
        entity: "scoutEntry",
        serverErrors: [{ path: "data.x", code: "bad", message: "Too many" }],
      })
    ).toEqual(["Too many", ["edit-and-retry", "discard"]])
  })
})
