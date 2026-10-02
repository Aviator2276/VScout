// Typed errors that render a specific screen (routing-auth §12).

/** The active event's season isn't this app version's game (routing-auth §5.2). */
export class UnsupportedSeasonError extends Error {
  readonly year: number
  constructor(year: number) {
    super(`unsupported season ${year}`)
    this.name = "UnsupportedSeasonError"
    this.year = year
  }
}
