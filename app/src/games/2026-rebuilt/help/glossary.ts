// Season glossary terms (ADR-055), written from the 2026 Game Manual (frcmanual.com/2026):
// sections 5 (Arena), 6 (Game Details), 7 (Game Rules) and 10 (Tournaments). Ids that match core
// terms (match, auto, foul, pinning…) override them with 2026's timings, values and rule numbers;
// the core stays season-agnostic. The owner reviews them in the PR (LQ-3).
import type { GlossaryTerm } from "@/types/glossary"
import fieldZonesDark from "./figures/field-zones.dark.svg?no-inline"
import fieldZones from "./figures/field-zones.svg?no-inline"
import hubShiftsDark from "./figures/hub-shifts.dark.svg?no-inline"
import hubShifts from "./figures/hub-shifts.svg?no-inline"
import pinningDark from "./figures/pinning.dark.svg?no-inline"
import pinning from "./figures/pinning.svg?no-inline"
import perimeterDark from "./figures/robot-perimeter.dark.svg?no-inline"
import perimeter from "./figures/robot-perimeter.svg?no-inline"
import towerLevelsDark from "./figures/tower-levels.dark.svg?no-inline"
import towerLevels from "./figures/tower-levels.svg?no-inline"
import towerProtectionDark from "./figures/tower-protection.dark.svg?no-inline"
import towerProtection from "./figures/tower-protection.svg?no-inline"
import trenchDark from "./figures/trench.dark.svg?no-inline"
import trench from "./figures/trench.svg?no-inline"

const game = (t: Omit<GlossaryTerm, "source">): GlossaryTerm => ({
  ...t,
  source: "game",
})

export const glossary: ReadonlyArray<GlossaryTerm> = [
  // ───────── 2026 details for core terms ─────────
  game({
    id: "match",
    term: "Match",
    aliases: ["matches"],
    short:
      "One game between the red and blue alliances: 2 minutes 40 seconds, a 20-second auto then 2:20 of teleop.",
    body: "Matches run on 7–10 minute cycles, counting setup and the field reset afterwards (Game Manual 6.1).",
    category: "match",
    related: ["auto", "teleop", "shift"],
  }),
  game({
    id: "ranking-points",
    term: "Ranking points",
    aliases: [
      "ranking point",
      "ranking points",
      "Ranking point",
      "RP",
      "RPs",
      "bonus RP",
      "bonus RPs",
    ],
    caseSensitive: true,
    short:
      "Points that rank teams in qualifications: 3 for a win, 1 for a tie, plus up to 3 bonus RP.",
    body: "The 2026 bonus RP are **Energized**, **Supercharged** and **Traversal**. Ranking points only count in qualification matches.",
    category: "match",
    related: ["energized", "supercharged", "traversal", "ranking-score"],
  }),
  game({
    id: "ranking-score",
    term: "Ranking score",
    aliases: ["ranking scores"],
    short:
      "A team's total ranking points divided by its scheduled qualification matches (surrogate matches excluded).",
    body: "Ties are broken by, in order: average match points without fouls, average fuel scored in auto, average tower points, then a random draw (Game Manual Table 10‑1).",
    category: "match",
    related: ["ranking-points", "surrogate"],
  }),
  game({
    id: "foul",
    term: "Foul",
    aliases: ["fouls", "penalty", "penalties"],
    short:
      "A rule violation called by a referee. In 2026 a minor foul gives the opponent 5 points, a major foul 15.",
    body: "The first ranking tiebreaker, average match points, leaves foul points out (Game Manual Table 10‑1).",
    category: "match",
    related: ["minor-foul", "major-foul", "yellow-card", "pinning"],
  }),
  game({
    id: "bumper",
    term: "Bumper",
    aliases: ["bumpers"],
    short:
      "The padded, alliance-colored frame around a robot. It protects robots and shows the team number.",
    body: "In 2026 bumpers must stay in the bumper zone, 2.5 in to 5.75 in off the floor. A robot whose bumper segment falls off, or that shows a bare corner of its frame, is disabled (G409).",
    category: "robot",
    related: ["robot-perimeter", "defense"],
  }),
  game({
    id: "robot-perimeter",
    term: "Robot perimeter",
    aliases: ["frame perimeter", "perimeter"],
    short:
      "The outline of a robot's fixed frame inside its bumpers. Contact inside an opponent's perimeter is restricted.",
    body: "A robot may not use a part outside its own perimeter (other than its bumpers) to start contact inside an opponent's perimeter: **minor foul** (G415). Damaging or impairing an opponent this way is a **major foul** and a yellow card, or a red card if the opponent can no longer drive (G416).\n\nBumper-to-bumper contact isn't a foul.",
    image: {
      src: perimeter,
      srcDark: perimeterDark,
      animated: true,
      alt: "A red robot's arm reaches over a blue robot's bumper into its frame. Minor foul.",
    },
    category: "robot",
    related: ["bumper", "defense", "minor-foul"],
  }),
  game({
    id: "pinning",
    term: "Pin",
    aliases: ["pins", "pinned", "pinning"],
    short:
      "Stopping an opponent from moving by holding it in place, directly or against a field element.",
    body: "A robot may pin an opponent for up to **3 seconds**. After that it's a **minor foul**, plus a **major foul** for every further 3 seconds (G418).\n\nThe pin count ends when the robots stay at least 72 in (6 ft) apart for 3 seconds, when either robot has moved 72 in from where the pin started for 3 seconds, or when the pinning robot gets pinned itself.",
    image: {
      src: pinning,
      srcDark: pinningDark,
      animated: true,
      alt: "A red robot holds a blue robot against the wall. After a 3-second count, a minor foul is called.",
    },
    category: "strategy",
    related: ["defense", "minor-foul", "major-foul"],
  }),

  // ───────── match timing ─────────
  game({
    id: "auto",
    term: "Auto",
    aliases: ["autonomous", "autonomous period"],
    short:
      "The first 20 seconds of the match. Robots run pre-programmed code with no driver control.",
    body: "Robots score fuel, may leave their starting line to collect more, and may climb to **Level 1** for 15 points (at most 2 robots per alliance in auto).\n\nBoth hubs are active. The alliance that scores **more fuel in auto** has its hub **inactive first**, in Shift 1. In auto, a robot whose bumpers are completely across the center line may not touch an opponent: major foul (G403).",
    category: "match",
    related: ["shift", "hub", "teleop"],
  }),
  game({
    id: "teleop",
    term: "Teleop",
    aliases: ["teleoperated", "teleoperated period"],
    short:
      "The last 2:20 of the match, with drivers in control: a transition shift, four alliance shifts, then end game.",
    category: "match",
    related: ["shift", "endgame", "auto"],
  }),
  game({
    id: "shift",
    term: "Shift",
    aliases: [
      "shifts",
      "alliance shift",
      "alliance shifts",
      "Shift 1",
      "Shift 2",
      "Shift 3",
      "Shift 4",
    ],
    short:
      "One of four 25-second teleop periods. In each, only one alliance's hub is active, and they alternate.",
    body: '| Period | Timer | Hubs |\n|---|---|---|\n| Auto | 0:20–0:00 | both active |\n| Transition shift | 2:20–2:10 | both active |\n| Shift 1 | 2:10–1:45 | auto winner inactive |\n| Shift 2 | 1:45–1:20 | auto winner active |\n| Shift 3 | 1:20–0:55 | auto winner inactive |\n| Shift 4 | 0:55–0:30 | auto winner active |\n| End game | 0:30–0:00 | both active |\n\nThe "auto winner" is the alliance that scored more fuel in auto. If auto fuel is tied, the field picks one at random (Game Manual 6.4).\n\nWhile its hub is inactive, an alliance can collect fuel, feed partners or play defense.',
    image: {
      src: hubShifts,
      srcDark: hubShiftsDark,
      animated: true,
      alt: "Timeline of a match: both hubs active in auto, the transition shift and end game; in Shifts 1 to 4 the red and blue hubs take turns being active.",
    },
    category: "match",
    related: ["transition-shift", "hub", "endgame"],
    seeAlsoGuide: "watching-a-match",
  }),
  game({
    id: "transition-shift",
    term: "Transition shift",
    aliases: ["transition"],
    short:
      "The first 10 seconds of teleop (2:20–2:10). Both hubs are still active.",
    category: "match",
    related: ["shift"],
  }),
  game({
    id: "endgame",
    term: "End game",
    aliases: ["endgame"],
    short:
      "The last 30 seconds of the match. Both hubs are active again and robots climb the tower.",
    body: "Tower protection applies during end game: touching an opponent robot that is in contact with its own tower is a major foul.",
    category: "match",
    related: ["tower", "tower-protection", "shift"],
  }),

  // ───────── scoring ─────────
  game({
    id: "fuel",
    term: "Fuel",
    short:
      "The 2026 game piece: a 5.91 in (15 cm) high-density foam ball. Each one scored in an active hub is 1 point.",
    body: "504 fuel are on the field each match: 24 in each depot, 24 in each outpost chute, up to 8 preloaded in each robot, and the rest in the neutral zone. Robots may hold any amount of fuel.",
    category: "game",
    related: ["hub", "depot", "outpost"],
  }),
  game({
    id: "hub",
    term: "Hub",
    aliases: ["hubs", "active hub", "inactive hub"],
    short:
      "Each alliance's goal. Fuel in an active hub is worth 1 point; fuel in an inactive hub is worth nothing.",
    body: "The hub is a 47 in square structure with a hexagonal opening on top, its front edge 72 in off the carpet. Each alliance's hub sits between two bumps, 158.6 in from its alliance wall. Scored fuel comes out of exits at the base into the neutral zone.\n\nLights on top show the status: the alliance color at full brightness when active, pulsing for 3 seconds before it turns inactive.\n\nA robot may only shoot into its hub while its bumpers are at least partly in its alliance zone (G407). Catching fuel as it leaves the hub, or parking under the hub to collect it, is a foul (G408).",
    category: "game",
    related: ["shift", "fuel", "alliance-zone"],
  }),
  game({
    id: "tower",
    term: "Tower",
    aliases: ["towers"],
    short:
      "The climbing structure built into each alliance wall: two uprights holding three rungs.",
    body: "The tower stands between driver stations 2 and 3. Its rungs are at 27 in (**low**), 45 in (**mid**) and 63 in (**high**) from the floor, 18 in apart.\n\nTo score a level, a robot must touch a rung or upright, and may otherwise only touch the tower wall, its supports, fuel or another robot. Robots may not fully hold up an alliance partner to climb: the held robot can't score tower points (G414).",
    image: {
      src: towerLevels,
      srcDark: towerLevelsDark,
      animated: true,
      alt: "Side view of the tower with three rungs and robots hanging at Level 1, Level 2 and Level 3, with their points.",
    },
    category: "game",
    related: ["level", "tower-protection", "traversal"],
  }),
  game({
    id: "level",
    term: "Level",
    aliases: [
      "Level 1",
      "Level 2",
      "Level 3",
      "level 1",
      "level 2",
      "level 3",
      "L1",
      "L2",
      "L3",
    ],
    caseSensitive: true,
    short:
      "How high a robot climbed the tower. Level 1: 15 points in auto, 10 in teleop. Level 2: 20. Level 3: 30.",
    body: "- **Level 1:** the robot no longer touches the carpet or the tower base.\n- **Level 2:** its bumpers are completely above the low rung.\n- **Level 3:** its bumpers are completely above the mid rung.\n\nA robot can earn Level 1 in auto (2 robots per alliance at most) and one level in teleop, so it can score both. Volunteers judge tower points right after auto and right after the match, so a climb should be clearly complete.",
    category: "game",
    related: ["tower", "traversal"],
  }),
  game({
    id: "tower-protection",
    term: "Tower protection",
    aliases: ["protected tower"],
    short:
      "In the last 30 seconds, touching an opponent robot that's touching its own tower is a major foul.",
    body: "It doesn't matter who starts the contact. If the opponent robot is off the ground, it's also awarded **Level 3** tower points (G420).\n\nContact through fuel counts too, when both robots touch the same fuel at the same time.",
    image: {
      src: towerProtection,
      srcDark: towerProtectionDark,
      animated: true,
      alt: "In the last 30 seconds, a red robot bumps a blue robot that is climbing the blue tower. A major foul is called and the blue robot gets Level 3.",
    },
    category: "game",
    related: ["tower", "level", "endgame"],
  }),
  game({
    id: "minor-foul",
    term: "Minor foul",
    aliases: ["minor fouls"],
    short: "A rule violation that gives the opponent alliance 5 points.",
    category: "match",
    related: ["major-foul", "foul"],
  }),
  game({
    id: "major-foul",
    term: "Major foul",
    aliases: ["major fouls"],
    short: "A rule violation that gives the opponent alliance 15 points.",
    body: "Common major fouls in 2026: shooting into the hub from outside your alliance zone (G407), touching an opponent across the center line in auto (G403), contact with an opponent on its tower in the last 30 seconds (G420), and every further 3 seconds of a pin after the first minor foul (G418).",
    category: "match",
    related: ["minor-foul", "foul", "tower-protection"],
  }),

  // ───────── ranking points ─────────
  game({
    id: "energized",
    term: "Energized",
    aliases: ["energized RP"],
    short:
      "A bonus ranking point when an alliance scores at least 100 fuel in active hubs in a match.",
    body: "100 is the threshold at regional and district events. District championships and the FIRST Championship may raise it.",
    category: "game",
    related: ["supercharged", "ranking-points"],
  }),
  game({
    id: "supercharged",
    term: "Supercharged",
    aliases: ["supercharged RP"],
    short:
      "A second bonus ranking point when an alliance scores at least 360 fuel in active hubs in a match.",
    body: "360 is the threshold at regional and district events. District championships and the FIRST Championship may raise it.",
    category: "game",
    related: ["energized", "ranking-points"],
  }),
  game({
    id: "traversal",
    term: "Traversal",
    aliases: ["traversal RP"],
    short:
      "A bonus ranking point when an alliance earns at least 50 tower points in a match.",
    body: "Tower points from auto and teleop both count. 50 is the threshold at regional and district events; championships may raise it.",
    category: "game",
    related: ["tower", "level", "ranking-points"],
  }),

  // ───────── field ─────────
  game({
    id: "alliance-zone",
    term: "Alliance zone",
    aliases: ["alliance zones"],
    short:
      "The area between an alliance's wall and its hub. Robots may only shoot into their hub from here.",
    image: {
      src: fieldZones,
      srcDark: fieldZonesDark,
      alt: "Top view of the field: blue alliance zone, the row of trench, bump, hub, bump, trench, the neutral zone with the center line, and the red side mirrored.",
    },
    category: "game",
    related: ["neutral-zone", "hub"],
  }),
  game({
    id: "neutral-zone",
    term: "Neutral zone",
    aliases: ["neutral zones"],
    short:
      "The middle of the field between the two hubs, split by the center line. Most fuel starts here.",
    image: {
      src: fieldZones,
      srcDark: fieldZonesDark,
      alt: "Top view of the field: blue alliance zone, the row of trench, bump, hub, bump, trench, the neutral zone with the center line, and the red side mirrored.",
    },
    category: "game",
    related: ["alliance-zone", "center-line"],
  }),
  game({
    id: "center-line",
    term: "Center line",
    aliases: ["centerline", "midline"],
    short:
      "The white line across the middle of the field. In auto, robots fully across it may not touch opponents.",
    category: "game",
    related: ["neutral-zone", "auto"],
  }),
  game({
    id: "starting-line",
    term: "Starting line",
    aliases: ["robot starting line", "starting lines"],
    short:
      "The alliance-colored line at the edge of each alliance zone. Robots start with their bumpers over it.",
    body: "A robot also can't start touching a bump, and can hold at most 8 fuel at the start (G303).",
    category: "game",
    related: ["auto", "alliance-zone"],
  }),
  game({
    id: "bump",
    term: "Bump",
    aliases: ["bumps"],
    short:
      "A 6.5 in tall ramp on either side of each hub that robots drive over between zones.",
    body: "Each bump is 73 in wide and 44.4 in deep. Robots that can't fit under the trench cross here.",
    category: "game",
    related: ["trench", "neutral-zone"],
  }),
  game({
    id: "trench",
    term: "Trench",
    aliases: ["trenches"],
    short:
      "A low arch from the guardrail to the bump that robots drive under. The gap is 22.25 in tall.",
    body: "Robots can be up to 30 in tall (R107), so a robot has to be built (or fold down) to 22.25 in or less to use the trench. Two robots working together may not block both trenches, or both bumps (G419).",
    image: {
      src: trench,
      srcDark: trenchDark,
      animated: true,
      alt: "Side view: a short robot drives under the trench arm through the 22.25-inch gap; a taller robot can't fit.",
    },
    category: "game",
    related: ["bump"],
  }),
  game({
    id: "depot",
    term: "Depot",
    aliases: ["depots"],
    short:
      "A floor area outlined by low steel barriers along each alliance wall. 24 fuel start in it.",
    category: "game",
    related: ["fuel", "outpost"],
  }),
  game({
    id: "outpost",
    term: "Outpost",
    aliases: ["outposts"],
    short:
      "Where the human player feeds fuel onto the field, at the corner between the guardrail and alliance wall.",
    body: "Human players put fuel in through the sloped **chute** (it holds about 25 behind a door) or the opening at the bottom, or throw it from the outpost area. Robots can push fuel back through the bottom opening into the **corral**, a floor bin on the human player's side.",
    category: "game",
    related: ["chute", "fuel", "human-player"],
  }),
  game({
    id: "chute",
    term: "Chute",
    aliases: ["chutes", "chute door"],
    short:
      "The sloped tunnel in the outpost that holds about 25 fuel. The human player opens its door to release them.",
    category: "game",
    related: ["outpost"],
  }),
  game({
    id: "corral",
    term: "Corral",
    aliases: ["corrals"],
    short:
      "The floor bin behind the outpost where fuel pushed off the field collects for the human player.",
    category: "game",
    related: ["outpost"],
  }),

  // ───────── strategy ─────────
  game({
    id: "feeding",
    term: "Feeding",
    aliases: ["feeder", "feeders", "fed partners"],
    short:
      "Moving fuel toward your own alliance zone so partners can score it, often while your hub is inactive.",
    body: "A robot can only shoot into its hub from its own alliance zone (G407), so robots collecting in the neutral zone often push or shoot fuel back toward their side instead.",
    category: "strategy",
    related: ["shift", "alliance-zone"],
  }),
]
