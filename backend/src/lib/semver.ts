// Minimal semver comparison with prerelease support (version gate, REQUIREMENTS §2.2).
interface Parsed {
  core: [number, number, number]
  pre: string[]
}

function parse(v: string): Parsed | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/.exec(v.trim())
  if (!m) return null
  return {
    core: [Number(m[1]), Number(m[2]), Number(m[3])],
    pre: m[4] ? m[4].split(".") : [],
  }
}

export function isValidSemver(v: string): boolean {
  return parse(v) !== null
}

/** -1 if a < b, 0 if equal, 1 if a > b. Invalid versions sort lowest. */
export function compareSemver(a: string, b: string): number {
  const pa = parse(a)
  const pb = parse(b)
  if (!pa || !pb) return pa ? 1 : pb ? -1 : 0
  for (let i = 0; i < 3; i++) {
    const d = (pa.core[i] ?? 0) - (pb.core[i] ?? 0)
    if (d) return d < 0 ? -1 : 1
  }
  if (!pa.pre.length || !pb.pre.length) {
    if (pa.pre.length === pb.pre.length) return 0
    return pa.pre.length ? -1 : 1
  }
  const n = Math.max(pa.pre.length, pb.pre.length)
  for (let i = 0; i < n; i++) {
    const x = pa.pre[i]
    const y = pb.pre[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const nx = /^\d+$/.test(x)
    const ny = /^\d+$/.test(y)
    if (nx && ny) {
      const d = Number(x) - Number(y)
      if (d) return d < 0 ? -1 : 1
    } else if (nx !== ny) return nx ? -1 : 1
    else if (x !== y) return x < y ? -1 : 1
  }
  return 0
}
