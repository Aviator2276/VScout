import { act, render, renderHook, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { useCan } from "@/hooks/use-can"
import { useSession } from "@/hooks/use-session"
import type { Session } from "@/lib/auth/types"
import { Can } from "../can"

const scouter: Session = {
  userId: "s",
  displayName: "S",
  role: "scouter",
  refreshExpiresAt: 0,
  status: "active",
  eventKey: null,
}
const guest: Session = { ...scouter, userId: "g", role: "guest" }

describe("<Can>", () => {
  it("shows children when allowed and the fallback otherwise", () => {
    const { rerender } = render(
      <Can
        session={scouter}
        permission="scouting:create"
        fallback={<span>No access</span>}
      >
        <button type="button">Scout this match</button>
      </Can>
    )
    expect(
      screen.getByRole("button", { name: "Scout this match" })
    ).toBeInTheDocument()
    rerender(
      <Can
        session={guest}
        permission="scouting:create"
        fallback={<span>No access</span>}
      >
        <button type="button">Scout this match</button>
      </Can>
    )
    expect(screen.queryByRole("button")).toBeNull()
    expect(screen.getByText("No access")).toBeInTheDocument()
  })

  it("checks policies against the resource", () => {
    render(
      <Can
        session={scouter}
        permission="comment:update"
        resource={{ authorId: "someone-else" }}
      >
        <button type="button">Edit</button>
      </Can>
    )
    expect(screen.queryByRole("button")).toBeNull()
  })
})

describe("hooks", () => {
  it("useSession follows the auth store; useCan mirrors can()", () => {
    let session: Session | null = null
    const listeners = new Set<() => void>()
    const store = {
      getSession: () => session,
      subscribe: (l: () => void) => {
        listeners.add(l)
        return () => listeners.delete(l)
      },
    }
    const { result } = renderHook(() => {
      const s = useSession(store)
      return { s, canScout: useCan(s, "scouting:create") }
    })
    expect(result.current).toEqual({ s: null, canScout: false })
    act(() => {
      session = scouter
      for (const l of listeners) l()
    })
    expect(result.current.canScout).toBe(true)
  })
})
