// A list's search box (matches.md, teams.md "Search"): the list filters on every keystroke (through
// useDeferredValue), and the URL `q` follows 300 ms after the last key. A new `q` from outside (a
// deep link, Back) replaces what's typed.
import { useDeferredValue, useEffect, useRef, useState } from "react"

export const URL_DEBOUNCE_MS = 300

export function useSearchQuery(
  urlQ: string | undefined,
  commit: (q: string | undefined) => void
): { query: string; deferred: string; setQuery: (value: string) => void } {
  const [query, setQueryState] = useState(urlQ ?? "")
  const deferred = useDeferredValue(query)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const commitRef = useRef(commit)
  useEffect(() => {
    commitRef.current = commit
  })
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )
  const [seenUrlQ, setSeenUrlQ] = useState(urlQ)
  if (seenUrlQ !== urlQ) {
    setSeenUrlQ(urlQ)
    if ((urlQ ?? "") !== query.trim()) setQueryState(urlQ ?? "")
  }
  const setQuery = (value: string) => {
    setQueryState(value)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(
      () => commitRef.current(value.trim() || undefined),
      URL_DEBOUNCE_MS
    )
  }
  return { query, deferred, setQuery }
}
