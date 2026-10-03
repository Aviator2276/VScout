// The season interface (ADR-009, systems/game-module.md §2). App code knows only these types and
// the active game from @/config/game. Descriptors are data; the only functions in a module are
// metrics[].compute and migrations.
import type { ZodType } from "zod"
import type { GlossaryTerm, GuideMeta } from "@/types/glossary"

// ───────── identity ─────────
export type GameId = `${number}-${string}`
/** stable, never reused: 'auto.moved' */
export type FieldId = string
export type LabelKey = string
export type Locale = "en"
export type EventType = "regional" | "district" | "dcmp" | "cmp" | "offseason"

/** Admin-editable per-event constants (ADR-043), validated by eventOverridesSchema. */
export type GameEventOverrides = Record<string, unknown>

export interface GameDefinition {
  id: GameId
  year: number
  name: LabelKey
  /** bump on any form change (§6) */
  schemaVersion: number
  match: MatchShape
  phases: ReadonlyArray<PhaseDef>
  matchForm: FormDef
  allianceForm?: AllianceRankFormDef
  incidents: IncidentTaxonomy
  pitForm: FormDef
  postForm: FormDef
  capabilities: ReadonlyArray<CapabilityDef>
  scoringKeys: ScoringKeys
  metrics: ReadonlyArray<MetricDef>
  validations: ReadonlyArray<ValidationDef>
  teamListColumns: ReadonlyArray<ColumnDef>
  prematchCard: ReadonlyArray<PrematchSectionDef>
  picklistHints: PicklistHints
  assets: GameAssets
  labels: Record<Locale, Record<LabelKey, string>>
  /** migrations[N] transforms data from version N to N+1 (§6) */
  migrations: Readonly<Record<number, EntryMigration>>
  /** words that must not appear outside src/games (§9) */
  bannedTerms: ReadonlyArray<string>
  glossary: ReadonlyArray<GlossaryTerm>
  guides?: ReadonlyArray<GuideMeta>
  eventOverridesSchema: ZodType<GameEventOverrides>
  defaultsByEventType: Record<EventType, GameEventOverrides>
}

// ───────── match timing (UI hints only, never data capture) ─────────
export interface MatchShape {
  robotsPerAlliance: 3
  stations: readonly ["1", "2", "3"]
  totalSec: number
}
export type PhaseKind = "pre" | "auto" | "teleop" | "endgame" | "post"
export interface PhaseDef {
  kind: PhaseKind
  label: LabelKey
  /** absent for pre/post */
  durationSec?: number
  subPeriods?: ReadonlyArray<{
    id: string
    label: LabelKey
    durationSec: number
  }>
  /** "Watch for: ..." banner */
  hint?: LabelKey
}

// ───────── forms ─────────
export type ScouterLevel = "new" | "experienced"
export type CompLevelScope = "qual" | "playoff"

export interface FormDef {
  id: "match" | "pit" | "post"
  sections: ReadonlyArray<SectionDef>
}
export interface SectionDef {
  id: string
  phase?: PhaseKind
  title: LabelKey
  description?: LabelKey
  fields: ReadonlyArray<FieldDef>
}

interface FieldBase<TKind extends string> {
  kind: TKind
  id: FieldId
  label: LabelKey
  help?: LabelKey
  required?: boolean | { modes: ReadonlyArray<ScouterLevel> }
  /** default both */
  modes?: ReadonlyArray<ScouterLevel>
  /** default both */
  stages?: ReadonlyArray<CompLevelScope>
  visibleWhen?: Condition
  /** detail fields are collapsed for new scouters */
  importance?: "core" | "detail"
}

export type Primitive = string | number | boolean | null
export type Condition =
  | { field: FieldId; eq: Primitive }
  | { field: FieldId; in: ReadonlyArray<Primitive> }
  | { field: FieldId; truthy: true }
  | { all: ReadonlyArray<Condition> }
  | { any: ReadonlyArray<Condition> }

export interface OptionDef {
  value: string
  label: LabelKey
  icon?: string
  tone?: "good" | "warn" | "bad"
}

export interface ChoiceField extends FieldBase<"choice"> {
  options: ReadonlyArray<OptionDef>
  display?: "segmented" | "list" | "grid" | "dropdown"
  /** adds "Didn't see" → null */
  allowUnknown?: boolean
}
export interface MultiChoiceField extends FieldBase<"multiChoice"> {
  options: ReadonlyArray<OptionDef>
  max?: number
}
export interface BooleanField extends FieldBase<"boolean"> {
  trueLabel?: LabelKey
  falseLabel?: LabelKey
  allowUnknown?: boolean
}
/** stepper, small clearly countable integers only (no timers, v1 lesson G1) */
export interface CountField extends FieldBase<"count"> {
  min: number
  max: number
  step?: number
}
export interface NumberField extends FieldBase<"number"> {
  min?: number
  max?: number
  unit?: "lb" | "in" | "kg" | "cm" | "yr"
  integer?: boolean
}
export interface RatingField extends FieldBase<"rating"> {
  scale: 3 | 5
  anchors: { low: LabelKey; high: LabelKey; mid?: LabelKey }
  /** "Didn't do this" */
  allowNA?: boolean
}
export interface DurationBucket {
  value: string
  label: LabelKey
  minSec: number
  maxSec: number | null
}
/** bucketed, never a stopwatch */
export interface DurationField extends FieldBase<"duration"> {
  buckets: ReadonlyArray<DurationBucket>
}
export interface ZoneDef {
  id: string
  label: LabelKey
  /** 0..1 coordinates, blue origin */
  polygon: ReadonlyArray<readonly [number, number]>
}
export interface FieldPositionField extends FieldBase<"fieldPosition"> {
  image: AssetKey
  mode: "zone" | "point"
  zones?: ReadonlyArray<ZoneDef>
  mirrorForAlliance: boolean
}
export interface TextField extends FieldBase<"text"> {
  multiline: boolean
  maxLength: number
  quickTags?: ReadonlyArray<OptionDef>
  placeholder?: LabelKey
}
export type IncidentListField = FieldBase<"incidents">

export type FieldDef =
  | ChoiceField
  | MultiChoiceField
  | BooleanField
  | CountField
  | NumberField
  | RatingField
  | DurationField
  | FieldPositionField
  | TextField
  | IncidentListField
export type FieldKind = FieldDef["kind"]

// ───────── incidents ─────────
export interface IncidentTaxonomy {
  types: ReadonlyArray<
    OptionDef & { defaultCategory?: string; countsAgainstReliability: boolean }
  >
  categories: ReadonlyArray<OptionDef>
  lengths: ReadonlyArray<DurationBucket>
  ignoreLengthsForReliability: ReadonlyArray<string>
  resolutions: ReadonlyArray<OptionDef>
  phases: ReadonlyArray<PhaseKind>
}
export interface IncidentValue {
  id: string
  phase: PhaseKind
  type: string | null
  category: string | null
  length: string | null
  resolution: string | null
  resolutionNote: string | null
  note: string | null
}

// ───────── alliance (super-scout) ranking, reserved ─────────
export interface AllianceRankFormDef {
  criteria: ReadonlyArray<{ id: string; label: LabelKey; help?: LabelKey }>
  extraFields?: ReadonlyArray<FieldDef>
}

// ───────── capabilities (pit is the source of truth, matches confirm) ─────────
export interface CapabilityDef {
  id: string
  label: LabelKey
  source: { pitField: FieldId } | { robotProfile: string }
  confirmedBy?: {
    matchField: FieldId
    rule: "anyEquals" | "maxOf"
    mapping?: Record<string, string>
  }
  display: "badge" | "value"
}

// ───────── external data (TBA / Statbotics) ─────────
export interface PerRobotPath {
  /** contains {n} for the station number */
  path: string
  enumMap?: string
}
export interface ScoringKeys {
  tba: {
    alliance: Record<string, string>
    perRobot: Record<string, PerRobotPath>
  }
  statbotics: {
    teamEvent: Record<string, string>
    match: Record<string, string>
  }
  /** raw TBA string → our option value; unknown strings map to null and are logged */
  enumMaps: Record<string, Record<string, string | null>>
  units: Record<string, LabelKey>
}

// ───────── views passed to metrics (game-agnostic) ─────────
export interface MatchFacts {
  matchKey: string
  /** play order within the team's schedule */
  order: number
  compLevel: "qm" | "ef" | "qf" | "sf" | "f"
  alliance: "red" | "blue"
  station: 1 | 2 | 3
  /** TBA per-robot values for this team, already mapped through enumMaps */
  tbaPerRobot: Readonly<Record<string, string | null>>
}
/** One match's scouting data for a team, consolidated across scouters (_kit/consolidate). */
export interface ScoutEntryView {
  matchKey: string
  data: Readonly<Record<FieldId, unknown>>
  scouterCount: number
  /** fields where scouters disagreed */
  disagreements: ReadonlyArray<FieldId>
}
export interface AllianceRankView {
  matchKey: string
  /** criterion id → 1 (best) … 3 */
  position: Readonly<Record<string, number>>
}
export interface PitEntryView {
  data: Readonly<Record<FieldId, unknown>>
  robot: Readonly<Record<string, unknown>>
}
export interface PostEntryView {
  data: Readonly<Record<FieldId, unknown>>
}
/** Statbotics / TBA values keyed by scoringKeys (generic keys like 'autoScoring') */
export type ExternalTeamStats = Readonly<Record<string, number | null>>

// ───────── derived metrics (pure) ─────────
export interface MetricInput {
  teamNumber: number
  window: "all" | "last4"
  matches: ReadonlyArray<MatchFacts>
  entries: ReadonlyArray<ScoutEntryView>
  allianceRanks: ReadonlyArray<AllianceRankView>
  pit: PitEntryView | null
  post: ReadonlyArray<PostEntryView>
  external: ExternalTeamStats | null
  weights: Readonly<Record<string, number>>
}
export interface MetricResult {
  /** null = not enough data */
  value: number | string | null
  sampleSize: number
  confidence: "low" | "medium" | "high"
  breakdown?: ReadonlyArray<{ label: LabelKey; value: number | string }>
}
export type RequiredMetricId =
  "consistency" | "reliability" | "defense" | "autoEffectiveness"
export interface MetricDef {
  id: RequiredMetricId | (string & {})
  label: LabelKey
  description: LabelKey
  format: "percent" | "score5" | "number" | "label"
  higherIsBetter: boolean
  /** MUST be pure and deterministic: no Dexie, Date or random */
  compute: (input: MetricInput) => MetricResult
}

// ───────── validation vs TBA ─────────
export interface ValidationDef {
  id: string
  matchField: FieldId
  /** key in scoringKeys.tba.perRobot */
  tbaPerRobot: string
  compare: "equal"
}

// ───────── presentation ─────────
export interface ColumnDef {
  id: string
  label: LabelKey
  source: { metric: string } | { capability: string } | { external: string }
  defaultVisible: boolean
}
export interface PrematchSectionDef {
  id: string
  title: LabelKey
  show: ReadonlyArray<
    | { metric: string }
    | { capability: string }
    | { field: FieldId; summary: "mode" | "tags" | "latest" }
    | { external: string }
  >
}
export interface PicklistHints {
  first: ReadonlyArray<string>
  second: ReadonlyArray<string>
}
export type AssetKey = string
export interface GameAssets {
  images: Record<
    AssetKey,
    { src: string; width: number; height: number; alt: LabelKey }
  >
  icon: string
}

// ───────── versioning ─────────
export type EntryMigration = (
  data: Record<FieldId, unknown>
) => Record<FieldId, unknown>
