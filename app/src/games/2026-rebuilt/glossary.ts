// Season glossary terms (ADR-055). Draft by the lead; the owner reviews them in the PR (LQ-3).
import type { GlossaryTerm } from "@/types/glossary"

export const glossary: ReadonlyArray<GlossaryTerm> = [
  {
    id: "fuel",
    term: "Fuel",
    short: "The 2026 game piece: a foam ball scored into your alliance's hub.",
    category: "game",
    source: "game",
  },
  {
    id: "hub",
    term: "Hub",
    aliases: ["hubs"],
    short: "Where fuel is scored. It's only worth points while it's active.",
    body: "Each alliance's hub switches between active and inactive during teleop, based on the auto result. Both hubs are active in the endgame.",
    category: "game",
    related: ["shift"],
    source: "game",
  },
  {
    id: "shift",
    term: "Shift",
    aliases: ["shifts"],
    short:
      "One of four 25-second teleop periods when the active hub can change.",
    category: "match",
    related: ["hub"],
    source: "game",
  },
  {
    id: "tower",
    term: "Tower",
    short:
      "The climbing structure. Level 1, 2 or 3 earns more points the higher the robot climbs.",
    category: "game",
    source: "game",
  },
  {
    id: "trench",
    term: "Trench",
    short:
      "A low passage on the field. Only robots short enough can drive under it.",
    category: "game",
    source: "game",
  },
  {
    id: "bump",
    term: "Bump",
    short: "A raised obstacle on the field that robots drive over.",
    category: "game",
    source: "game",
  },
  {
    id: "outpost",
    term: "Outpost",
    short: "Where the human player feeds fuel to robots.",
    category: "game",
    source: "game",
  },
  {
    id: "depot",
    term: "Depot",
    short:
      "A stash of fuel on the alliance's side of the field that robots can pick up from.",
    category: "game",
    source: "game",
  },
  {
    id: "energized",
    term: "Energized",
    caseSensitive: false,
    short: "A bonus ranking point for scoring enough fuel in a match.",
    category: "game",
    related: ["supercharged"],
    source: "game",
  },
  {
    id: "supercharged",
    term: "Supercharged",
    short: "A second bonus ranking point for scoring even more fuel.",
    category: "game",
    related: ["energized"],
    source: "game",
  },
  {
    id: "traversal",
    term: "Traversal",
    short: "A bonus ranking point for earning enough tower points.",
    category: "game",
    related: ["tower"],
    source: "game",
  },
]
