// Event date ranges as people say them: "Mar 20–22, 2026", "Mar 30 – Apr 2, 2026".
const MONTH = new Intl.DateTimeFormat("en-US", {
  month: "short",
  timeZone: "UTC",
})

function parts(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`)
  return {
    month: MONTH.format(d),
    day: d.getUTCDate(),
    year: d.getUTCFullYear(),
  }
}

export function formatEventDates(startDate: string, endDate: string): string {
  const s = parts(startDate)
  const e = parts(endDate)
  if (s.year !== e.year)
    return `${s.month} ${s.day}, ${s.year} – ${e.month} ${e.day}, ${e.year}`
  if (s.month !== e.month)
    return `${s.month} ${s.day} – ${e.month} ${e.day}, ${e.year}`
  if (s.day === e.day) return `${s.month} ${s.day}, ${s.year}`
  return `${s.month} ${s.day}–${e.day}, ${s.year}`
}

/** Past = ended before `today` (YYYY-MM-DD in the device's zone). */
export function splitByDate<TEvent extends { endDate: string }>(
  events: ReadonlyArray<TEvent>,
  today: string
): { current: Array<TEvent>; past: Array<TEvent> } {
  const current: Array<TEvent> = []
  const past: Array<TEvent> = []
  for (const e of events) (e.endDate < today ? past : current).push(e)
  return { current, past }
}

export function localDate(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
