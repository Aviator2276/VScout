// Core glossary (features/glossary-help.md §6): generic FRC and VScout words, no season terms. The
// game module adds the season's words and overrides these by id.
import type { GlossaryTerm } from "@/types/glossary"

const core = (t: Omit<GlossaryTerm, "source">): GlossaryTerm => ({
  ...t,
  source: "core",
})

export const coreGlossary: ReadonlyArray<GlossaryTerm> = [
  core({
    id: "alliance",
    term: "Alliance",
    aliases: ["alliances"],
    short: "Three teams that play together in a match: red or blue.",
    category: "match",
    related: ["alliance-selection"],
  }),
  core({
    id: "auto",
    term: "Auto",
    aliases: ["autonomous"],
    short:
      "The first part of a match, when robots run on their own with no drivers.",
    category: "match",
    related: ["teleop", "endgame"],
  }),
  core({
    id: "teleop",
    term: "Teleop",
    short: "The driver-controlled part of a match, after auto.",
    category: "match",
    related: ["auto", "endgame"],
  }),
  core({
    id: "endgame",
    term: "Endgame",
    short:
      "The last seconds of teleop, when special end-of-match points are scored.",
    category: "match",
    related: ["teleop"],
  }),
  core({
    id: "disabled",
    term: "Disabled",
    aliases: ["disable", "disables"],
    short:
      "A robot that stopped moving during a match, by a fault or by the referees.",
    body: "Note when it happened and for how long. A short brownout and a dead robot for the rest of the match are very different.",
    category: "robot",
    related: ["brownout"],
    seeAlsoGuide: "first-match",
  }),
  core({
    id: "brownout",
    term: "Brownout",
    aliases: ["brownouts", "browned out"],
    short:
      "The robot's battery voltage dropped so low that motors slowed or stopped for a moment.",
    category: "robot",
    related: ["disabled"],
  }),
  core({
    id: "defense",
    term: "Defense",
    aliases: ["defending", "defended"],
    short:
      "Blocking or slowing robots of the other alliance instead of scoring.",
    category: "strategy",
    related: ["pinning"],
  }),
  core({
    id: "pinning",
    term: "Pinning",
    aliases: ["pinned", "pin"],
    short:
      "Trapping another robot against a wall or field element. It's a foul after a few seconds.",
    category: "strategy",
    related: ["defense", "foul"],
  }),
  core({
    id: "foul",
    term: "Foul",
    aliases: ["fouls"],
    short: "A rule break that gives points to the other alliance.",
    category: "match",
  }),
  core({
    id: "epa",
    term: "EPA",
    caseSensitive: true,
    short:
      "Expected Points Added: a rating of how many points a team adds to its alliance.",
    category: "strategy",
    related: ["opr"],
  }),
  core({
    id: "opr",
    term: "OPR",
    caseSensitive: true,
    short:
      "Offensive Power Rating: a team's share of its alliances' scores, estimated from results.",
    category: "strategy",
    related: ["epa"],
  }),
  core({
    id: "alliance-selection",
    term: "Alliance selection",
    short:
      "After qualifications, the top seeds pick partners for the playoffs.",
    category: "strategy",
    related: ["picklist"],
  }),
  core({
    id: "picklist",
    term: "Picklist",
    aliases: ["picklists", "pick list"],
    short: "A ranked list of teams to pick during alliance selection.",
    category: "vscout",
    related: ["followed-picklist", "alliance-selection"],
  }),
  core({
    id: "followed-picklist",
    term: "Followed picklist",
    short:
      "The picklist an admin chose for the team. It shows first for everyone.",
    category: "vscout",
    related: ["picklist"],
  }),
  core({
    id: "sync",
    term: "Sync",
    aliases: ["synced", "syncing"],
    short:
      "Sending your changes to the server and getting everyone else's. VScout does it automatically.",
    body: "Everything you do is saved on your device first, so it works offline. When you're connected again, it sends what's waiting.",
    category: "vscout",
  }),
  core({
    id: "station",
    term: "Station",
    aliases: ["driver station"],
    short: "One of the six robot spots in a match: Red 1–3 and Blue 1–3.",
    category: "match",
  }),
]
