// Pit map from FRC Nexus (REQUIREMENTS §6.3): Nexus describes the pit area as shapes, so the server
// draws it as an SVG and serves `{ rev, imageUrl, pits: [{ teamNumber, x, y, w, h }] }` in the
// SVG's pixel space. The parser accepts the shapes Nexus is known to use and ignores anything else.

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface ParsedMap {
  width: number
  height: number
  pits: Map<string, Rect>
  areas: Array<Rect & { label?: string }>
  labels: Array<{ x: number; y: number; text: string }>
}

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined)

function rectOf(v: unknown): Rect | null {
  if (!v || typeof v !== "object") return null
  const o = v as Record<string, unknown>
  const pos = (o.position ?? o.pos ?? o) as Record<string, unknown>
  const size = (o.size ?? o.dimensions ?? o) as Record<string, unknown>
  const x = num(pos.x) ?? num(pos.left)
  const y = num(pos.y) ?? num(pos.top)
  const w = num(size.width) ?? num(size.w) ?? (o.size ? num(size.x) : undefined)
  const h = num(size.height) ?? num(size.h) ?? (o.size ? num(size.y) : undefined)
  if (x === undefined || y === undefined || !w || !h || w <= 0 || h <= 0) return null
  return { x, y, w, h }
}

function entries(container: unknown, keyFields: string[]): Array<[string, unknown]> {
  if (Array.isArray(container)) {
    return container.flatMap((item, i) => {
      if (!item || typeof item !== "object") return []
      const o = item as Record<string, unknown>
      const key = keyFields.map((k) => o[k]).find((v) => typeof v === "string" || typeof v === "number")
      return [[String(key ?? i), item] as [string, unknown]]
    })
  }
  if (container && typeof container === "object") return Object.entries(container as Record<string, unknown>)
  return []
}

export function parseNexusMap(body: unknown): ParsedMap | null {
  if (!body || typeof body !== "object") return null
  const b = body as Record<string, unknown>
  const pits = new Map<string, Rect>()
  for (const [addr, v] of entries(b.pits, ["address", "label", "name", "id"])) {
    const r = rectOf(v)
    if (r) pits.set(addr, r)
  }
  if (!pits.size) return null
  const areas: ParsedMap["areas"] = []
  for (const [name, v] of entries(b.areas, ["label", "name", "id"])) {
    const r = rectOf(v)
    const label = (v as Record<string, unknown>)?.label
    if (r) areas.push({ ...r, label: typeof label === "string" ? label : name })
  }
  const labels: ParsedMap["labels"] = []
  for (const [text, v] of entries(b.labels, ["text", "label", "name"])) {
    const o = v as Record<string, unknown>
    const pos = (o?.position ?? o) as Record<string, unknown>
    const x = num(pos?.x)
    const y = num(pos?.y)
    const t = typeof o?.text === "string" ? o.text : typeof o?.label === "string" ? o.label : text
    if (x !== undefined && y !== undefined) labels.push({ x, y, text: t })
  }

  // normalize into a positive coordinate space with a margin
  const all = [...pits.values(), ...areas]
  const minX = Math.min(...all.map((r) => r.x), ...labels.map((l) => l.x))
  const minY = Math.min(...all.map((r) => r.y), ...labels.map((l) => l.y))
  const margin = 20
  const dx = margin - minX
  const dy = margin - minY
  for (const r of all) {
    r.x += dx
    r.y += dy
  }
  for (const l of labels) {
    l.x += dx
    l.y += dy
  }
  const width = Math.ceil(Math.max(...all.map((r) => r.x + r.w), ...labels.map((l) => l.x + 40)) + margin)
  const height = Math.ceil(Math.max(...all.map((r) => r.y + r.h), ...labels.map((l) => l.y + 20)) + margin)
  return { width, height, pits, areas, labels }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const r2 = (n: number) => Math.round(n * 100) / 100

export function renderSvg(map: ParsedMap, teamsByPit: Map<string, number>): string {
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${map.width} ${map.height}" width="${map.width}" height="${map.height}" font-family="system-ui, sans-serif">`,
    `<rect width="100%" height="100%" fill="#ffffff"/>`,
  ]
  for (const a of map.areas) {
    parts.push(`<rect x="${r2(a.x)}" y="${r2(a.y)}" width="${r2(a.w)}" height="${r2(a.h)}" fill="#eef1f5" stroke="#c5ccd6"/>`)
    if (a.label)
      parts.push(
        `<text x="${r2(a.x + a.w / 2)}" y="${r2(a.y + 14)}" font-size="12" text-anchor="middle" fill="#5b6573">${esc(a.label)}</text>`
      )
  }
  for (const [addr, p] of map.pits) {
    const team = teamsByPit.get(addr)
    parts.push(
      `<rect x="${r2(p.x)}" y="${r2(p.y)}" width="${r2(p.w)}" height="${r2(p.h)}" rx="2" fill="${team ? "#dbeafe" : "#f8fafc"}" stroke="#64748b"/>`
    )
    const size = Math.max(6, Math.min(p.h * 0.4, p.w * 0.3, 16))
    parts.push(
      `<text x="${r2(p.x + p.w / 2)}" y="${r2(p.y + p.h / 2)}" font-size="${r2(size)}" text-anchor="middle" dominant-baseline="central" fill="#0f172a">${esc(team ? String(team) : addr)}</text>`
    )
  }
  for (const l of map.labels)
    parts.push(`<text x="${r2(l.x)}" y="${r2(l.y)}" font-size="14" fill="#334155">${esc(l.text)}</text>`)
  parts.push("</svg>")
  return parts.join("")
}
