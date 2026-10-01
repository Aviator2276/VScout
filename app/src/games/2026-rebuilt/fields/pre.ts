import type { SectionDef, ZoneDef } from "../../types"

// Start zones across the blue starting line (blue origin, 0..1, mirrored for red).
const band = (id: string, y0: number, y1: number): ZoneDef => ({
  id,
  label: `pre.startZone.${id}`,
  polygon: [
    [0.26, y0],
    [0.32, y0],
    [0.32, y1],
    [0.26, y1],
  ],
})

export const preSection = {
  id: "pre",
  phase: "pre",
  title: "phase.pre",
  fields: [
    {
      kind: "boolean",
      id: "pre.noShow",
      label: "pre.noShow",
      help: "pre.noShow.help",
      importance: "core",
    },
    {
      kind: "fieldPosition",
      id: "pre.startZone",
      label: "pre.startZone",
      image: "field",
      mode: "zone",
      mirrorForAlliance: true,
      zones: [
        band("nearTrenchLeft", 0, 0.2),
        band("nearBumpLeft", 0.2, 0.4),
        band("centerHub", 0.4, 0.6),
        band("nearBumpRight", 0.6, 0.8),
        band("nearTrenchRight", 0.8, 1),
      ],
      visibleWhen: { field: "pre.noShow", eq: false },
      importance: "core",
    },
    {
      kind: "boolean",
      id: "pre.preloaded",
      label: "pre.preloaded",
      allowUnknown: true,
      visibleWhen: { field: "pre.noShow", eq: false },
      importance: "detail",
    },
  ],
} as const satisfies SectionDef
