// The picklist vote and the master list (scout-tab.md A.2, ADR-080).
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { App } from "konsta/react"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { createTestRuntime } from "@/testing/data-runtime"
import { TEST_USER } from "@/testing/db"
import { toDomain } from "@/testing/factories/records"
import {
  TEST_EVENT,
  wirePicklist,
  wirePicklistEntry,
  wireUser,
} from "@/testing/factories/wire"
import { usePicklistWrites } from "../api/get-picklists"
import { useVote } from "../api/get-vote"
import type { VotePurpose } from "../api/get-vote"
import { VoteView } from "../components/vote-view"

const SAM = "01900000-0000-7000-8000-000000000042"
const ALEX = "01900000-0000-7000-8000-000000000043"

function Harness({ canBuild }: { canBuild: boolean }) {
  const [purpose, setPurpose] = useState<VotePurpose>("first")
  const data = useVote(TEST_EVENT, purpose)
  const writes = usePicklistWrites(TEST_EVENT)
  return (
    <VoteView
      purpose={purpose}
      onPurposeChange={setPurpose}
      data={data}
      canVote
      canBuild={canBuild}
      onVote={(id) => void writes.setBallot(purpose, id)}
      onAdd={(teams) =>
        void (data?.master
          ? writes.addTeams(
              data.master.id,
              data.master.rows.at(-1)?.rank ?? null,
              teams
            )
          : writes.create({
              name: "Master First Pick",
              purpose,
              master: true,
              teams,
            }))
      }
    />
  )
}

async function setup(role: "admin" | "scouter" = "scouter") {
  const t = createTestRuntime({ viewer: { userId: TEST_USER, role } })
  await t.seedScope(`event:${TEST_EVENT}`, "picklist")
  await t.db.users.bulkPut([
    toDomain("user", wireUser({ id: SAM, displayName: "Sam" })),
    toDomain("user", wireUser({ id: ALEX, displayName: "Alex" })),
  ])
  let n = 0
  const list = async (
    owner: string,
    name: string,
    purpose: "first" | "second" | "dnp",
    teams: Array<number>,
    ballot = true
  ) => {
    const l = toDomain(
      "picklist",
      wirePicklist({
        id: `${owner.slice(-2)}-${name}`,
        ownerId: owner,
        authorId: owner,
        name,
        purpose,
        ...(ballot ? { ballot: true } : {}),
      })
    )
    await t.db.picklists.put(l)
    await t.db.picklistEntries.bulkPut(
      teams.map((team, i) =>
        toDomain(
          "picklistEntry",
          wirePicklistEntry({
            id: `e${++n}`,
            authorId: owner,
            picklistId: l.id,
            teamNumber: team,
            rank: `a${i}`,
          })
        )
      )
    )
    return l
  }
  await list(SAM, "Sam 1st", "first", [254, 1678])
  await list(ALEX, "Alex 1st", "first", [1678, 254, 971])
  await list(ALEX, "Old 1st", "first", [971], false)
  await list(SAM, "Sam DNP", "dnp", [971], false)
  const mine = await list(TEST_USER, "My 1st", "first", [254, 971], false)
  render(
    <App theme="ios">
      <t.wrapper>
        <Harness canBuild={role === "admin"} />
      </t.wrapper>
    </App>
  )
  return { t, mine }
}

const results = () => screen.getByRole("list", { name: "Vote results" })
const order = () =>
  within(results())
    .getAllByRole("listitem")
    .map((li) => li.textContent.match(/^\d{1,2}?(\d{3,4})/)?.[1])

describe("picklist vote (ADR-080)", () => {
  it("ranks the ballots by ranked choice and flags do-not-pick", async () => {
    await setup()
    await screen.findByRole("list", { name: "Vote results" })
    // ballots: Sam [254, 1678], Alex [1678, 254, 971] → a 1-1 tie, also on Borda score and first
    // choices, so the higher number (1678) drops and 254 wins round 2
    expect(order()).toEqual(["254", "1678", "971"])
    expect(screen.getByText("2 ballots")).toBeInTheDocument()
    const row971 = within(results()).getAllByRole("listitem")[2] ?? results()
    expect(row971).toHaveTextContent(/DNP 1/)
    await userEvent.click(
      within(row971).getByRole("button", { expanded: false })
    )
    expect(
      screen.getByRole("list", { name: "Where each voter put 971" })
    ).toHaveTextContent("Alex #3")
    // a scouter can't build the master list
    expect(
      screen.queryByRole("button", { name: /to the master list/ })
    ).toBeNull()
  })

  it("my vote: picking a list adds my ballot; Don't Vote withdraws it", async () => {
    const { t, mine } = await setup()
    await screen.findByText("2 ballots")
    await userEvent.click(screen.getByText("My 1st"))
    await screen.findByText("3 ballots")
    expect((await t.db.picklists.get(mine.id))?.ballot).toBe(true)
    // You [254, 971] joins: 254 now has 2 of 3 first choices, a majority
    expect(within(results()).getAllByRole("listitem")[0]).toHaveTextContent(
      "Majority · 2 of 3 votes"
    )
    await userEvent.click(screen.getByText("Don’t Vote"))
    await screen.findByText("2 ballots")
    expect((await t.db.picklists.get(mine.id))?.ballot).toBeUndefined()
  })

  it("an admin builds the master list from the results", async () => {
    const { t } = await setup("admin")
    await screen.findByText("Not started yet")
    await userEvent.click(
      screen.getByRole("button", { name: "Add 1678 to the master list" })
    )
    await screen.findByLabelText("1678 is number 1 on the master list")
    // adds the rest without the do-not-pick team
    await userEvent.click(
      screen.getByRole("button", { name: "Add 1 More to Master" })
    )
    await vi.waitFor(async () => {
      const master = (await t.db.picklists.toArray()).find((l) => l.master)
      expect(master?.name).toBe("Master First Pick")
      const entries = await t.db.picklistEntries
        .where("[picklistId+rank]")
        .between([master?.id ?? "", ""], [master?.id ?? "", "￿"])
        .toArray()
      expect(entries.map((e) => e.teamNumber)).toEqual([1678, 254])
    })
    expect(
      screen.getByRole("link", { name: /Master First Pick/ })
    ).toBeInTheDocument()
  })

  it("second pick has its own ballots", async () => {
    await setup()
    await screen.findByText("2 ballots")
    await userEvent.click(screen.getByRole("radio", { name: "Second Pick" }))
    await screen.findByText("No votes yet")
    expect(screen.getByText("0 ballots")).toBeInTheDocument()
  })
})
