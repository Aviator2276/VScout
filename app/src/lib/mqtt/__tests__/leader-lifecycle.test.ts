import { describe, expect, it } from "vitest"
import type { MachineEvent } from "../connection-machine"
import { attachLifecycle } from "../lifecycle"
import { requestLeadership } from "../leader"
import type { LockManagerLike } from "../leader"

/** One lock, steal supported: like navigator.locks for a single name. */
function fakeLocks(): LockManagerLike {
  let holder: { reject: (e: Error) => void } | null = null
  return {
    request(_name, opts, callback) {
      return new Promise((resolve, reject) => {
        const take = () => {
          holder = { reject }
          void callback().then(resolve, reject)
        }
        if (holder && opts.steal) {
          const abort = new Error("stolen")
          abort.name = "AbortError"
          holder.reject(abort)
          take()
        } else if (!holder) take()
      })
    },
  }
}

describe("leader election (mqtt.md §3.4)", () => {
  it("a visible tab steals leadership; the old leader is told", async () => {
    const locks = fakeLocks()
    const events: Array<string> = []
    requestLeadership(
      locks,
      { steal: false },
      () => events.push("a+"),
      () => events.push("a-")
    )
    await Promise.resolve()
    requestLeadership(
      locks,
      { steal: true },
      () => events.push("b+"),
      () => events.push("b-")
    )
    await new Promise((r) => setTimeout(r, 0))
    expect(events).toEqual(["a+", "b+", "a-"])
  })

  it("every tab leads without Web Locks", () => {
    let gained = false
    requestLeadership(
      undefined,
      { steal: false },
      () => (gained = true),
      () => undefined
    ).release()
    expect(gained).toBe(true)
  })
})

describe("lifecycle wiring", () => {
  it("turns page events into machine events with the hidden duration", () => {
    const target = new EventTarget()
    const vis = { state: "visible" as DocumentVisibilityState }
    const doc = {
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
      get visibilityState() {
        return vis.state
      },
    }
    const win = new EventTarget()
    const seen: Array<MachineEvent> = []
    let t = 0
    const detach = attachLifecycle(
      { handle: (e) => seen.push(e) },
      { window: win, document: doc, now: () => t }
    )
    vis.state = "hidden"
    target.dispatchEvent(new Event("visibilitychange"))
    t = 7000
    vis.state = "visible"
    target.dispatchEvent(new Event("visibilitychange"))
    win.dispatchEvent(new Event("online"))
    win.dispatchEvent(new Event("offline"))
    win.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }))
    detach()
    win.dispatchEvent(new Event("online"))
    expect(seen).toEqual([
      { type: "HIDDEN" },
      { type: "VISIBLE", hiddenMs: 7000 },
      { type: "ONLINE" },
      { type: "OFFLINE" },
      { type: "VISIBLE", hiddenMs: Infinity },
    ])
  })
})
