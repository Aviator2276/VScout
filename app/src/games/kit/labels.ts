// Season labels. App chrome strings live in app i18n; everything game-specific comes from here.
import type { GameDefinition, LabelKey, Locale } from "../types"

/** The label for `key`; falls back to the key itself so a missing label is visible, not blank. */
export function t(
  game: Pick<GameDefinition, "labels">,
  key: LabelKey,
  locale: Locale = "en"
): string {
  return game.labels[locale][key] ?? key
}
