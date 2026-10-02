# 2026 REBUILT game module

Everything specific to the 2026 game lives in this folder (ADR-009). App code imports
`@/config/game`, never this folder.

- **The match form is BETA** (owner, 2026-10-01). Field ids are append-only: never rename or
  reuse one. Any change to a form bumps `schemaVersion` in `definition.ts` and, if old data needs
  reshaping, adds `migrations[N]`.
- **Unverified:** TBA per-robot tower strings (`scoring-keys.ts` `enumMaps.towerLevel`) and the
  foul list in `fields/post.ts`. Record real TBA and Statbotics responses into `__fixtures__/` when
  available.
- RP thresholds: `overrides.ts` (owner's table; admins override per event).
- Words in `terms.json` are banned outside `src/games` by lint and the banned-terms test.
