// userSettings.homeLayout (features/home.md H6, ADR-067/075): per-breakpoint ordered lists, no
// positions. Older shapes migrate on read; a newer `v` fails and the caller keeps the raw value.
import { z } from "zod"

export const HOME_BREAKPOINTS = ["compact", "regular", "wide"] as const
export const homeBreakpointId = z.enum(HOME_BREAKPOINTS)

export const homeGridItem = z.looseObject({
  id: z.string().min(1).max(64),
  widget: z.string().min(1).max(64),
  w: z.number().int().min(1).max(8),
  h: z.number().int().min(1).max(8),
  config: z.record(z.string(), z.unknown()).optional(),
})

export const homeGridList = z.array(homeGridItem).max(40)

export const homeLayoutV2 = z.looseObject({
  v: z.literal(2),
  active: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("template"),
      templateId: z.string().min(1).max(40),
    }),
    z.object({ kind: z.literal("custom") }),
  ]),
  custom: z
    .looseObject({
      compact: homeGridList.optional(),
      regular: homeGridList.optional(),
      wide: homeGridList.optional(),
    })
    .default({}),
})
export type HomeLayout = z.infer<typeof homeLayoutV2>

const SIZE_V1: Record<string, readonly [number, number]> = {
  small: [2, 2],
  medium: [4, 2],
  large: [4, 4],
}

/** The round-2 ordered-list shape → v2 (defensive: it never shipped). */
export function migrateHomeLayout(input: unknown): unknown {
  if (!input || typeof input !== "object") return input
  const o = input as Record<string, unknown>
  if (o.v === 2) return input
  if ("v" in o) return input // a newer version: let zod fail, the caller keeps the raw value
  if (!Array.isArray(o.widgets)) return undefined
  const legacy = o.widgets as Array<unknown>
  const withXY = legacy.every(
    (w) => typeof w === "object" && w !== null && "x" in w && "y" in w
  )
  const ordered = withXY
    ? [...legacy].sort((a, b) => {
        const p = a as { x: number; y: number }
        const q = b as { x: number; y: number }
        return p.y - q.y || p.x - q.x
      })
    : legacy
  const items = ordered.flatMap((raw) => {
    const w = raw as {
      id?: unknown
      type?: unknown
      size?: unknown
      config?: unknown
    }
    if (typeof w.id !== "string" || typeof w.type !== "string") return []
    const size = SIZE_V1[String(w.size)] ?? ([2, 2] as const)
    return [
      {
        id: w.id,
        widget: w.type,
        w: size[0],
        h: size[1],
        ...(w.config && typeof w.config === "object"
          ? { config: w.config }
          : {}),
      },
    ]
  })
  if (items.length === 0)
    return {
      v: 2,
      active: {
        kind: "template",
        templateId: typeof o.preset === "string" ? o.preset : "starter",
      },
      custom: {},
    }
  return { v: 2, active: { kind: "custom" }, custom: { compact: items } }
}

export const homeLayoutSetting = z.preprocess(migrateHomeLayout, homeLayoutV2)
