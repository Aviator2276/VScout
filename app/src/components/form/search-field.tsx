// Inline search field above a list (HIG Search fields, iOS: an inline field filters one view). The
// label is visually hidden: the magnifier and placeholder carry it. Never autofocuses (it pops the
// keyboard). A footnote under the field can say how the query was read.
import { useId } from "react"
import type { ReactNode } from "react"
import { CircleX, Search } from "@/components/icons/icon"

export interface SearchFieldProps {
  label: string
  /** the search landmark's name, unique on the page: what it searches ("Matches") */
  landmark: string
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  /** "Showing: Team 254 · Qual 12" */
  footnote?: ReactNode
  /**
   * Sort and filter beside the field (owner): while the field is focused they slide away and the
   * field takes the full width; they come back when focus leaves.
   */
  actions?: ReactNode
}

export function SearchField({
  label,
  landmark,
  value,
  onValueChange,
  placeholder,
  footnote,
  actions,
}: SearchFieldProps) {
  const id = useId()
  const noteId = `${id}-note`
  return (
    <div role="search" aria-label={landmark} className="py-2">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="group/search flex items-center">
        <div className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-full bg-muted px-3 text-muted-foreground transition-[box-shadow] focus-within:ring-2 focus-within:ring-ring/40">
          <Search aria-hidden size={18} />
          <input
            id={id}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            value={value}
            placeholder={placeholder}
            aria-describedby={footnote ? noteId : undefined}
            onChange={(e) => onValueChange(e.target.value)}
            className="min-h-11 min-w-0 flex-1 bg-transparent text-body text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
          />
          {value ? (
            <button
              type="button"
              aria-label="Clear Search"
              onClick={() => onValueChange("")}
              className="hit-44 -me-1 flex size-8 items-center justify-center rounded-full"
            >
              <CircleX aria-hidden size={18} />
            </button>
          ) : null}
        </div>
        {actions ? (
          <div className="flex max-w-40 shrink-0 items-center overflow-hidden ps-1 transition-[max-width,opacity,translate] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-focus-within/search:max-w-0 group-focus-within/search:translate-x-6 group-focus-within/search:opacity-0 motion-reduce:transition-none">
            {actions}
          </div>
        ) : null}
      </div>
      {footnote ? (
        <p
          id={noteId}
          aria-live="polite"
          className="mt-1.5 px-1 text-footnote text-muted-foreground"
        >
          {footnote}
        </p>
      ) : null}
    </div>
  )
}
