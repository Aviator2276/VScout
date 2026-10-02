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
}

export function SearchField({
  label,
  landmark,
  value,
  onValueChange,
  placeholder,
  footnote,
}: SearchFieldProps) {
  const id = useId()
  const noteId = `${id}-note`
  return (
    <div role="search" aria-label={landmark} className="py-2">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="flex min-h-11 items-center gap-2 rounded-xl bg-muted px-3 text-muted-foreground">
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
