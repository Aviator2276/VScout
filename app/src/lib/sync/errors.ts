// Errors the write API throws before touching the database, so forms can show them.
import type { z } from "zod"

export class ValidationError extends Error {
  readonly issues: ReadonlyArray<z.core.$ZodIssue>
  constructor(message: string, issues: ReadonlyArray<z.core.$ZodIssue>) {
    super(message)
    this.name = "ValidationError"
    this.issues = issues
  }
}

export class NotAllowedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "NotAllowedError"
  }
}

export class RecordNotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} ${id} not found`)
    this.name = "RecordNotFoundError"
  }
}
