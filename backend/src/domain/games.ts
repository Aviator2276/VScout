// Game payload checks (REQUIREMENTS §5.2). The server never knows game fields: it checks the
// (gameId, schemaVersion) pair and, when the app publishes a JSON Schema for it, validates `data`.
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { Ajv } from "ajv"
import type { ValidateFunction } from "ajv"
import { problem } from "../lib/problem.js"

const FORM_BY_ENTITY: Record<string, string> = {
  scoutEntry: "match",
  pitScouting: "pit",
  postScouting: "post",
}

export class GameRegistry {
  private validators = new Map<string, ValidateFunction | null>()
  private ajv = new Ajv({ allErrors: true, strict: false })

  constructor(
    readonly versions: Record<string, number[]>,
    private schemaDir?: string
  ) {}

  check(entity: string, rec: Record<string, unknown>) {
    const gameId = String(rec.gameId ?? "")
    const version = Number(rec.schemaVersion)
    const known = this.versions[gameId]
    if (!known) throw problem(422, "unknown_game", { errors: [{ path: "gameId", code: "unknown_game" }] })
    if (!known.includes(version))
      throw problem(422, "unsupported_schema_version", {
        errors: [{ path: "schemaVersion", code: "unsupported_schema_version", message: `Supported: ${known.join(", ")}` }],
      })
    const validate = this.validator(gameId, version, FORM_BY_ENTITY[entity])
    if (validate && !validate(rec.data)) {
      throw problem(422, "validation_failed", {
        errors: (validate.errors ?? []).map((e) => ({
          path: ["data", ...e.instancePath.split("/").filter(Boolean)].join("."),
          code: e.keyword,
          message: e.message ?? "invalid",
        })),
      })
    }
  }

  private validator(gameId: string, version: number, form: string | undefined): ValidateFunction | null {
    if (!this.schemaDir) return null
    const key = `${gameId}@${version}#${form ?? ""}`
    if (this.validators.has(key)) return this.validators.get(key) ?? null
    let fn: ValidateFunction | null = null
    const file = join(this.schemaDir, gameId, `schema.v${version}.json`)
    if (existsSync(file)) {
      const schema = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>
      const forms = schema.forms as Record<string, unknown> | undefined
      const sub = form && forms?.[form]
      fn = sub ? this.ajv.compile(sub as object) : forms ? null : this.ajv.compile(schema)
    }
    this.validators.set(key, fn)
    return fn
  }
}
