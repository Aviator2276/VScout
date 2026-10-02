import { describe, expect, it } from "vitest"
import { formatEventDates, localDate, splitByDate } from "../utils/event-dates"

describe("event dates", () => {
  it("formats ranges the way people say them", () => {
    expect(formatEventDates("2026-03-20", "2026-03-22")).toBe("Mar 20–22, 2026")
    expect(formatEventDates("2026-03-30", "2026-04-02")).toBe(
      "Mar 30 – Apr 2, 2026"
    )
    expect(formatEventDates("2026-12-31", "2027-01-02")).toBe(
      "Dec 31, 2026 – Jan 2, 2027"
    )
    expect(formatEventDates("2026-05-01", "2026-05-01")).toBe("May 1, 2026")
  })

  it("splits past events from current and upcoming ones", () => {
    const e = (endDate: string) => ({ endDate })
    expect(
      splitByDate(
        [e("2026-03-22"), e("2026-10-01"), e("2026-11-01")],
        "2026-10-01"
      )
    ).toEqual({
      current: [e("2026-10-01"), e("2026-11-01")],
      past: [e("2026-03-22")],
    })
    expect(localDate(new Date(2026, 9, 1, 12).getTime())).toBe("2026-10-01")
  })
})
