// Core glossary (features/glossary-help.md §6): FRC and VScout words that hold in every season.
// Nothing season-specific lives here: no timings, point values, rule numbers or game words. The
// active game module overrides a term by id to add its season's details (games/<season>/help/).
import type { GlossaryTerm } from "@/types/glossary"
import defenseFigureDark from "./figures/defense.dark.svg?no-inline"
import defenseFigure from "./figures/defense.svg?no-inline"

const core = (t: Omit<GlossaryTerm, "source">): GlossaryTerm => ({
  ...t,
  source: "core",
})

export const coreGlossary: ReadonlyArray<GlossaryTerm> = [
  // ───────── match ─────────
  core({
    id: "match",
    term: "Match",
    aliases: ["matches"],
    short:
      "One game between the red and blue alliances, made of an autonomous period and a teleoperated period.",
    category: "match",
    related: ["auto", "teleop", "alliance"],
  }),
  core({
    id: "alliance",
    term: "Alliance",
    aliases: ["alliances"],
    short:
      "The teams playing together on one side, red or blue. Three robots per alliance play each match.",
    body: "The Game Manual defines an alliance as a cooperative of up to 4 teams. In qualifications the schedule pairs 3 teams at random for each match. In the playoffs an alliance is the 3 teams picked at alliance selection, plus a backup team if one is called in.",
    category: "match",
    related: ["alliance-selection", "backup-team", "station"],
  }),
  core({
    id: "station",
    term: "Driver station",
    aliases: ["driver stations", "station", "stations"],
    short:
      "One of the 3 spots in an alliance wall where a drive team stands. Red 1–3 and Blue 1–3 name the six robots.",
    body: "In VScout, the station (for example Blue 2) tells you which robot to watch. The number on the team sign at that station should match the number on the robot's bumpers.",
    category: "match",
    related: ["drive-team", "alliance"],
  }),
  core({
    id: "auto",
    term: "Auto",
    aliases: ["autonomous", "autonomous period"],
    short:
      "The first period of a match. Robots run pre-programmed code with no driver control.",
    body: "The field blocks all driver input during auto, and the drive team can't touch the robot or its controls.",
    category: "match",
    related: ["teleop", "match"],
  }),
  core({
    id: "teleop",
    term: "Teleop",
    aliases: ["teleoperated", "teleoperated period"],
    short:
      "The driver-controlled period after auto, until the end of the match.",
    category: "match",
    related: ["auto", "endgame"],
  }),
  core({
    id: "endgame",
    term: "Endgame",
    aliases: ["end game"],
    short:
      "The final stretch of teleop, when end-of-match tasks such as climbing score points.",
    category: "match",
    related: ["teleop"],
  }),
  core({
    id: "drive-team",
    term: "Drive team",
    aliases: ["drive teams"],
    short:
      "Up to 5 people from one team running its robot in a match: drivers, human players, a drive coach and a technician.",
    body: "At most 1 member can be a non-student. Up to 3 students act as drivers or human players, plus 1 drive coach (a guide or advisor) and 1 technician who helps with setup and connection problems.",
    category: "match",
    related: ["human-player", "station"],
  }),
  core({
    id: "human-player",
    term: "Human player",
    aliases: ["human players"],
    short:
      "A drive team member who handles game pieces from outside the field, feeding them to robots.",
    category: "match",
    related: ["drive-team"],
  }),
  core({
    id: "qualification",
    term: "Qualification match",
    aliases: [
      "qualification matches",
      "qualifications",
      "qualification",
      "quals",
      "qual",
    ],
    short:
      "The scheduled matches with random partners. Teams earn ranking points that set their seeding.",
    category: "match",
    related: ["ranking-points", "ranking-score", "playoffs"],
  }),
  core({
    id: "playoffs",
    term: "Playoffs",
    aliases: [
      "playoff",
      "playoff match",
      "playoff matches",
      "double elimination",
    ],
    short:
      "The double-elimination bracket after alliance selection. Alliances advance by winning; no ranking points.",
    body: "Every alliance starts in the upper bracket. Losing an upper-bracket match drops an alliance to the lower bracket, and losing there knocks it out (Finals excepted). In the first round the higher-seeded alliance plays as red.",
    category: "match",
    related: ["alliance-selection"],
  }),
  core({
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
      "Points that rank teams in qualifications, earned for winning, tying and meeting the season's bonus goals.",
    body: "Ranking points only count in qualification matches.",
    category: "match",
    related: ["ranking-score", "qualification"],
  }),
  core({
    id: "ranking-score",
    term: "Ranking score",
    aliases: ["ranking scores"],
    short:
      "A team's total ranking points divided by its scheduled qualification matches (surrogate matches excluded).",
    body: "Ties in ranking score are broken by criteria the season's manual lists, ending in a random draw.",
    category: "match",
    related: ["ranking-points", "surrogate"],
  }),
  core({
    id: "surrogate",
    term: "Surrogate",
    aliases: ["surrogates", "surrogate match"],
    short:
      "A team picked at random to play one extra qualification match. It earns 0 ranking points, and that match isn't counted.",
    category: "match",
    related: ["ranking-score"],
  }),
  core({
    id: "alliance-selection",
    term: "Alliance selection",
    short:
      "After qualifications, the top 8 teams become alliance leads and each picks 2 more teams for the playoffs.",
    body: "Picking goes in two rounds. Round 1 runs from Alliance 1 to Alliance 8, round 2 runs back from Alliance 8 to Alliance 1. Each captain invites a team ranked below them, and the team accepts or declines on the spot.\n\nA team that declines can't become a backup team, and an alliance lead that declines can't be invited by another alliance. After selection, the highest-ranked teams left over are the backup teams. Small events form fewer alliances.",
    category: "strategy",
    related: ["picklist", "backup-team", "playoffs"],
  }),
  core({
    id: "backup-team",
    term: "Backup team",
    aliases: ["backup teams", "backup robot"],
    short:
      "An unpicked team that can replace a robot on a playoff alliance, for example after a breakdown.",
    body: "The alliance captain brings in the highest-ranked available team. An alliance can't call a backup team before it has played its first playoff match.",
    category: "match",
    related: ["alliance-selection"],
  }),
  core({
    id: "arena-fault",
    term: "Arena fault",
    aliases: ["arena faults", "field fault", "field faults"],
    short:
      "An error in field operation, like a broken field element or power failure. It can lead to a replay.",
    body: "A robot's own radio or code problem isn't an arena fault. Neither is tripping the breaker in a driver station. When you log a field fault, say what you saw: the referees decide what counts.",
    category: "match",
    related: ["disabled"],
  }),

  // ───────── penalties ─────────
  core({
    id: "foul",
    term: "Foul",
    aliases: ["fouls", "penalty", "penalties"],
    short:
      "A rule violation called by a referee. Points go to the opponent's score.",
    category: "match",
    related: ["yellow-card", "red-card", "pinning"],
  }),
  core({
    id: "yellow-card",
    term: "Yellow card",
    aliases: ["yellow cards", "yellow carded"],
    short:
      "A warning from the head referee for egregious behavior. A second yellow card becomes a red card.",
    body: "A team with a card carries a yellow card into later matches, shown next to its number on the audience screen. Yellow cards clear after practice, qualification and division playoff matches. In the playoffs a card applies to the whole alliance.",
    category: "match",
    related: ["red-card", "foul"],
  }),
  core({
    id: "red-card",
    term: "Red card",
    aliases: ["red cards", "red carded"],
    short:
      "A penalty from the head referee that disqualifies the team for that match.",
    category: "match",
    related: ["yellow-card", "disqualified"],
  }),
  core({
    id: "disqualified",
    term: "Disqualified",
    aliases: ["disqualification", "DQ", "DQed", "DQ'd"],
    short:
      "The team gets 0 match points and 0 ranking points (qualifications), or its alliance gets 0 match points (playoffs).",
    category: "match",
    related: ["red-card"],
  }),

  // ───────── robot ─────────
  core({
    id: "disabled",
    term: "Disabled",
    aliases: ["disable", "disables", "disabling"],
    short:
      "A robot that stops working mid-match. Officially, a robot the field has shut off for the rest of the match.",
    body: 'In the Game Manual, **disabled** is a penalty state: the field commands all of the robot\'s outputs off for the rest of the match, for example for an unsafe robot.\n\nScouters also say a robot "disabled" when it stops on its own: a dead battery, a lost connection, a brownout. Log what you saw, when it happened and how long it lasted. A two-second brownout and a robot dead for the whole match are very different.',
    category: "robot",
    related: ["brownout", "bypassed", "arena-fault"],
    seeAlsoGuide: "first-match",
  }),
  core({
    id: "bypassed",
    term: "Bypassed",
    aliases: ["bypass"],
    short:
      "A robot that can't or isn't allowed to play a match, as decided by the FTA, lead robot inspector or head referee.",
    category: "robot",
    related: ["disabled"],
  }),
  core({
    id: "brownout",
    term: "Brownout",
    aliases: ["brownouts", "browned out", "browning out"],
    short:
      "The battery voltage dropped so low that the robot's controller cut motor power to keep itself running.",
    body: "It looks like a robot that suddenly slows, stutters or stops for a moment, often while pushing or accelerating hard, then recovers. Common causes are a weak or old battery and a loose connection.",
    category: "robot",
    related: ["disabled"],
  }),
  core({
    id: "bumper",
    term: "Bumper",
    aliases: ["bumpers"],
    short:
      "The padded, alliance-colored frame around a robot. It protects robots and shows the team number.",
    body: "Bumpers must stay in the bumper zone, a band close to the floor. A robot whose bumper falls off can be disabled.",
    category: "robot",
    related: ["robot-perimeter", "defense"],
  }),
  core({
    id: "robot-perimeter",
    term: "Robot perimeter",
    aliases: ["frame perimeter", "perimeter"],
    short:
      "The outline of a robot's fixed frame inside its bumpers. Contact inside an opponent's perimeter is restricted.",
    body: "Reaching into an opponent's perimeter with a mechanism is a foul; bumper-to-bumper contact isn't. The season's rules set the penalty.",
    category: "robot",
    related: ["bumper", "defense", "foul"],
  }),
  core({
    id: "e-stop",
    term: "E-Stop",
    aliases: ["E-Stops", "estop", "A-Stop", "A-Stops"],
    short:
      "The emergency stop button on each driver station shelf. It shuts the robot down in an emergency.",
    body: "Each driver station also has an **A-Stop** (autonomous stop) that disables the robot during auto only, for example when its auto routine goes wrong.",
    category: "robot",
    related: ["disabled"],
  }),

  // ───────── strategy ─────────
  core({
    id: "defense",
    term: "Defense",
    aliases: [
      "defending",
      "defended",
      "defensive",
      "defense bot",
      "playing defense",
    ],
    short:
      "Blocking, pushing or slowing opponents instead of scoring. Bumper-to-bumper contact is legal.",
    body: "Good defense makes an opponent take longer to score: it blocks their path, pushes them off line, or makes them miss. It must stay legal:\n\n- **Bumper to bumper** contact is normal play.\n- **Reaching inside** an opponent's frame perimeter is a foul.\n- **Pinning** an opponent past the time limit is a foul.\n- **Damaging** a robot on purpose earns a card.\n\nWhen you rate defense, judge the effect on the opponent, not how aggressive it looked.",
    image: {
      src: defenseFigure,
      srcDark: defenseFigureDark,
      animated: true,
      alt: "Top view: a red robot drives into a blue robot bumper to bumper and pushes it off its path. Legal defense.",
    },
    category: "strategy",
    related: ["pinning", "robot-perimeter", "bumper"],
  }),
  core({
    id: "pinning",
    term: "Pin",
    aliases: ["pins", "pinned", "pinning"],
    short:
      "Stopping an opponent from moving by holding it in place, directly or against a field element.",
    body: "A referee counts how long a pin lasts. Past the season's time limit, it's a foul.",
    category: "strategy",
    related: ["defense", "foul"],
  }),
  core({
    id: "cycle",
    term: "Cycle",
    aliases: ["cycles", "cycling", "cycle time"],
    short:
      "One round trip: collecting game pieces, driving to score them, and coming back. Faster cycles mean more points.",
    category: "strategy",
  }),
  core({
    id: "epa",
    term: "EPA",
    caseSensitive: true,
    short:
      "Expected Points Added, from Statbotics: an estimate of how many points a team adds to its alliance's score.",
    body: "EPA updates after every match and weighs recent matches more. It's a good first filter, but it can't see what scouts see: defense, reliability, how a robot fits with partners.",
    category: "strategy",
    related: ["opr"],
  }),
  core({
    id: "opr",
    term: "OPR",
    caseSensitive: true,
    short:
      "Offensive Power Rating: a team's share of its alliances' scores, solved from all match results at the event.",
    body: "OPR is noisy early in an event, when teams have played few matches.",
    category: "strategy",
    related: ["epa"],
  }),

  // ───────── VScout ─────────
  core({
    id: "picklist",
    term: "Picklist",
    aliases: ["picklists", "pick list", "pick lists"],
    short:
      "A ranked list of teams to pick at alliance selection. Each scouter can keep their own.",
    category: "vscout",
    related: ["followed-picklist", "alliance-selection"],
    seeAlsoGuide: "picklists",
  }),
  core({
    id: "followed-picklist",
    term: "Followed picklist",
    short:
      "The picklist an admin chose for the team. It shows first for everyone.",
    category: "vscout",
    related: ["picklist"],
    seeAlsoGuide: "picklists",
  }),
  core({
    id: "pit-scouting",
    term: "Pit scouting",
    aliases: ["pit scout", "pit scouted", "pit scouts"],
    short:
      "Visiting a team in the pits to ask about its robot: drivetrain, mechanisms, what it can score and climb.",
    category: "vscout",
    seeAlsoGuide: "pit-scouting",
  }),
  core({
    id: "scouter-level",
    term: "Scouter level",
    short:
      "New or experienced. New scouters get helpers and extra questions folded under More Details. Change it in Settings → Scouting.",
    category: "vscout",
  }),
  core({
    id: "sync",
    term: "Sync",
    aliases: ["synced", "syncing", "synchronize"],
    short:
      "Sending your changes to the server and getting everyone else's. VScout does it automatically.",
    body: "Everything you do is saved on your device first, so VScout works offline. When you're connected again, it sends what's waiting.",
    category: "vscout",
    seeAlsoGuide: "offline",
  }),
]
