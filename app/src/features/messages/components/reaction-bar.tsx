// The reaction bar under announcements and messages (ADR-066/073): one chip per emoji in use, then
// an add button with the allow-list. Tapping a chip toggles your reaction. Each chip's name says
// the count, whether you reacted, and who did.
import { useState } from "react"
import { SmilePlus } from "@/components/icons/icon"
import { REACTION_EMOJI } from "@/lib/contracts/reaction"
import { haptic } from "@/lib/haptics"
import { cn } from "@/lib/utils"
import type { Emoji, ReactionCount } from "../api/get-announcements"

export function ReactionBar({
  reactions,
  onToggle,
  disabled,
  canAdd = true,
}: {
  reactions: ReadonlyArray<ReactionCount>
  onToggle: (emoji: Emoji, mineId: string | null) => void
  disabled?: boolean
  /** messages add reactions from their action sheet (FX-21); announcements keep the + button */
  canAdd?: boolean
}) {
  const [picking, setPicking] = useState(false)
  const toggle = (emoji: Emoji, mineId: string | null) => {
    haptic("selection")
    setPicking(false)
    onToggle(emoji, mineId)
  }
  const unused = REACTION_EMOJI.filter(
    (e) => !reactions.some((r) => r.emoji === e)
  )
  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      role="group"
      aria-label="Reactions"
    >
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          disabled={disabled}
          aria-pressed={r.mineId !== null}
          aria-label={`${r.emoji} ${r.count}: ${r.names.join(", ")}`}
          title={r.names.join(", ")}
          onClick={() => toggle(r.emoji, r.mineId)}
          className={cn(
            "hit-44 inline-flex min-h-9 items-center gap-1 rounded-full border px-2.5 text-subhead tabular-nums",
            r.mineId
              ? "border-primary bg-primary/10"
              : "border-border bg-transparent"
          )}
        >
          <span aria-hidden>{r.emoji}</span>
          <span aria-hidden>{r.count}</span>
        </button>
      ))}
      {!canAdd ? null : picking ? (
        unused.map((e) => (
          <button
            key={e}
            type="button"
            aria-label={`React with ${e}`}
            onClick={() => toggle(e, null)}
            className="hit-44 inline-flex size-9 items-center justify-center rounded-full bg-muted text-body"
          >
            {e}
          </button>
        ))
      ) : unused.length > 0 ? (
        <button
          type="button"
          disabled={disabled}
          aria-label="Add Reaction"
          onClick={() => setPicking(true)}
          className="hit-44 inline-flex size-9 items-center justify-center rounded-full text-muted-foreground"
        >
          <SmilePlus aria-hidden size={18} />
        </button>
      ) : null}
    </div>
  )
}
