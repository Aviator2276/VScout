// P3 (scout-tab.md A): several lists combined on read (ADR-042). Choose the sources and the method;
// each row shows mean rank, spread, how many lists include it, DNP flags and everyone's reasons.
import { useState } from "react"
import { Button } from "@/components/controls/button"
import { ChipGroup } from "@/components/controls/chip-group"
import { Segmented } from "@/components/controls/segmented"
import { GlossaryText } from "@/components/glossary/glossary-text"
import { ClipboardList } from "@/components/icons/icon"
import type { CombineMethod, CombinedRow } from "../utils/combine"

export interface CombineSource {
  id: string
  label: string
}

export function CombinedView({
  sources,
  selected,
  onSelectedChange,
  method,
  onMethodChange,
  rows,
  nicknames,
  onSave,
}: {
  sources: ReadonlyArray<CombineSource>
  selected: ReadonlyArray<string>
  onSelectedChange: (ids: Array<string>) => void
  method: CombineMethod
  onMethodChange: (m: CombineMethod) => void
  rows: ReadonlyArray<CombinedRow>
  nicknames: ReadonlyMap<number, string>
  /** scouters/admins snapshot the result as their own list */
  onSave?: (() => void) | undefined
}) {
  const [open, setOpen] = useState<number | null>(null)
  return (
    <div className="flex flex-col gap-3">
      <section aria-labelledby="combine-sources">
        <h2
          id="combine-sources"
          className="mb-1.5 px-1 text-footnote text-muted-foreground uppercase"
        >
          Lists to combine
        </h2>
        <ChipGroup
          label="Lists to combine"
          options={sources.map((s) => ({ value: s.id, label: s.label }))}
          value={selected}
          onValueChange={onSelectedChange}
        />
      </section>
      <Segmented
        label="Method"
        value={method}
        onValueChange={onMethodChange}
        options={[
          { value: "average-rank", label: "Average Rank" },
          { value: "borda", label: "Borda" },
        ]}
      />
      {selected.length === 0 ? (
        <div
          role="status"
          className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground"
        >
          <ClipboardList aria-hidden size={40} />
          <p className="text-headline text-foreground">
            Choose lists to combine
          </p>
        </div>
      ) : rows.length === 0 ? (
        <p
          role="status"
          className="py-10 text-center text-subhead text-muted-foreground"
        >
          These lists have no teams yet
        </p>
      ) : (
        <ol aria-label="Combined picklist" className="flex flex-col gap-2">
          {rows.map((r) => (
            <li
              key={r.teamNumber}
              className="rounded-2xl bg-card px-3 py-2 shadow-xs"
            >
              <button
                type="button"
                aria-expanded={open === r.teamNumber}
                onClick={() =>
                  setOpen(open === r.teamNumber ? null : r.teamNumber)
                }
                className="flex min-h-12 w-full items-center gap-3 text-left"
              >
                <span className="w-6 font-heading text-subhead text-muted-foreground tabular-nums">
                  {r.position}
                </span>
                <span className="font-heading text-headline tabular-nums">
                  {r.teamNumber}
                </span>
                <span className="min-w-0 flex-1 truncate text-subhead">
                  {nicknames.get(r.teamNumber) ?? ""}
                </span>
                <span className="flex flex-col items-end text-footnote text-muted-foreground tabular-nums">
                  <span>
                    {method === "borda"
                      ? `${r.score} pts`
                      : `avg ${r.meanRank}`}{" "}
                    · {r.min}–{r.max}
                  </span>
                  <span>
                    on {r.count} {r.count === 1 ? "list" : "lists"}
                    {r.dnp > 0 ? ` · DNP by ${r.dnp}` : ""}
                  </span>
                </span>
              </button>
              {open === r.teamNumber ? (
                r.reasons.length ? (
                  <ul className="flex flex-col gap-1 ps-9 pb-2 text-footnote">
                    {r.reasons.map((x, i) => (
                      <li key={i}>
                        <span className="font-semibold">{x.owner}:</span>{" "}
                        <GlossaryText>{x.text}</GlossaryText>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="ps-9 pb-2 text-footnote text-muted-foreground">
                    No reasons written
                  </p>
                )
              ) : null}
            </li>
          ))}
        </ol>
      )}
      {onSave && rows.length > 0 ? (
        <Button size="large" variant="secondary" onClick={onSave}>
          Save as My Picklist
        </Button>
      ) : null}
    </div>
  )
}
