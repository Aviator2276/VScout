// Semver precedence for the client's version gate (ADR-076: the client compares
// minClientVersion itself). Same rules as scripts/bump-version.mjs; a test keeps them in sync.

const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z.-]+)?$/

export interface SemVer {
  major: number
  minor: number
  patch: number
  pre: Array<string>
}

export function parseSemver(version: string): SemVer | null {
  const m = SEMVER.exec(version.trim())
  if (!m) return null
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    pre: m[4] ? m[4].split(".") : [],
  }
}

function compareIdentifiers(a: string, b: string): number {
  const an = /^\d+$/.test(a)
  const bn = /^\d+$/.test(b)
  if (an && bn) return Math.sign(Number(a) - Number(b))
  if (an) return -1
  if (bn) return 1
  return a < b ? -1 : a > b ? 1 : 0
}

/** -1, 0 or 1 by semver precedence. Throws on a non-semver string. */
export function compareSemver(a: string, b: string): number {
  const x = parseSemver(a)
  const y = parseSemver(b)
  if (!x) throw new Error(`Not a semver version: ${a}`)
  if (!y) throw new Error(`Not a semver version: ${b}`)
  for (const k of ["major", "minor", "patch"] as const) {
    if (x[k] !== y[k]) return Math.sign(x[k] - y[k])
  }
  if (x.pre.length === 0 && y.pre.length === 0) return 0
  if (x.pre.length === 0) return 1
  if (y.pre.length === 0) return -1
  const n = Math.max(x.pre.length, y.pre.length)
  for (let i = 0; i < n; i++) {
    const xi = x.pre[i]
    const yi = y.pre[i]
    if (xi === undefined) return -1
    if (yi === undefined) return 1
    const c = compareIdentifiers(xi, yi)
    if (c !== 0) return c
  }
  return 0
}

/** True when `version` is below `minimum` (the client must update). */
export function isBelowMinimum(version: string, minimum: string): boolean {
  return compareSemver(version, minimum) < 0
}

export type ReleaseChannel = "alpha" | "beta" | "rc" | "stable"

/**
 * The release channel a version belongs to (release-versioning.md, `app/release.config.json`):
 * the first prerelease identifier, or stable without one. Unknown tags count as alpha.
 */
export function releaseChannel(version: string): ReleaseChannel {
  const v = parseSemver(version)
  if (!v) return "alpha"
  const [tag] = v.pre
  if (tag === undefined) return "stable"
  return tag === "beta" || tag === "rc" || tag === "alpha" ? tag : "alpha"
}
