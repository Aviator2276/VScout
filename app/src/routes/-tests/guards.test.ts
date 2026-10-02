// The route guards (routing-auth §5) against a real runtime: no session → /login, a session on
// /login → onward, no event → /onboarding, another season → the unsupported screen.
import { isRedirect } from "@tanstack/react-router"
import { beforeEach, describe, expect, it } from "vitest"
import type { RouterContext } from "@/app/router-context"
import { UnsupportedSeasonError } from "@/components/errors/app-errors"
import { activeGame } from "@/config/game"
import { setupAppRuntime } from "@/testing/app-runtime"
import { TEST_EVENT } from "@/testing/factories/wire"
import { MOCK_CREDENTIALS, mockBackend } from "@/testing/mocks/mock-backend"
import { Route as AuthedRoute } from "../_authed"
import { Route as EventRoute } from "../_authed/_event"
import { Route as LoginRoute } from "../login"

beforeEach(() => mockBackend.reset())

type Guard = (args: unknown) => Promise<unknown>
const guard = (route: { options: unknown }) =>
  (route.options as { beforeLoad: Guard }).beforeLoad

async function outcome(run: () => Promise<unknown>) {
  try {
    return { value: await run() }
  } catch (error) {
    if (isRedirect(error)) return { redirect: error.options }
    return { error }
  }
}

function context(t: ReturnType<typeof setupAppRuntime>): RouterContext {
  return { app: () => t.runtime, game: activeGame }
}
const location = { href: "/teams/254?view=pit", pathname: "/teams/254" }

describe("_authed", () => {
  it("sends a signed-out visitor to /login with the way back", async () => {
    const t = setupAppRuntime({ isOnline: () => false })
    expect(
      await outcome(() => guard(AuthedRoute)({ context: context(t), location }))
    ).toMatchObject({
      redirect: {
        to: "/login",
        search: { redirect: "/teams/254?view=pit" },
      },
    })
  })

  it("lets a cached session through offline", async () => {
    const t = setupAppRuntime()
    await t.runtime.auth.login(
      MOCK_CREDENTIALS.username,
      MOCK_CREDENTIALS.password
    )
    const r = await outcome(() =>
      guard(AuthedRoute)({ context: context(t), location })
    )
    expect(r).toMatchObject({
      value: { session: { displayName: "Alex" } },
    })
  })
})

describe("/login", () => {
  it("skips the form when already signed in, but not for Sign In Again", async () => {
    const t = setupAppRuntime()
    await t.runtime.auth.login(
      MOCK_CREDENTIALS.username,
      MOCK_CREDENTIALS.password
    )
    expect(
      await outcome(() =>
        guard(LoginRoute)({
          context: context(t),
          search: { redirect: "/teams" },
        })
      )
    ).toMatchObject({ redirect: { href: "/teams" } })
    expect(
      await outcome(() =>
        guard(LoginRoute)({ context: context(t), search: { reauth: true } })
      )
    ).toEqual({ value: undefined })
  })

  it("cleans the redirect target (routing-auth §6)", () => {
    const parse = (redirect: string) =>
      (
        LoginRoute.options.validateSearch as {
          parse: (v: unknown) => { redirect?: string }
        }
      ).parse({
        redirect,
      }).redirect
    expect(parse("//evil.com")).toBe("/")
    expect(parse("/teams/42?sort=epa")).toBe("/teams/42?sort=epa")
    expect(parse("/login?redirect=/login")).toBe("/")
  })
})

describe("_event", () => {
  it("sends you to pick an event first", async () => {
    const t = setupAppRuntime()
    await t.runtime.auth.login(
      MOCK_CREDENTIALS.username,
      MOCK_CREDENTIALS.password
    )
    expect(
      await outcome(() => guard(EventRoute)({ context: context(t), location }))
    ).toMatchObject({
      redirect: {
        to: "/onboarding",
        search: { redirect: "/teams/254?view=pit" },
      },
    })
  })

  it("provides the active event, or the unsupported-season screen for another year", async () => {
    const t = setupAppRuntime()
    await t.runtime.auth.login(
      MOCK_CREDENTIALS.username,
      MOCK_CREDENTIALS.password
    )
    await t.runtime.setActiveEvent(TEST_EVENT)
    expect(
      await outcome(() => guard(EventRoute)({ context: context(t), location }))
    ).toEqual({
      value: { event: { key: TEST_EVENT, name: TEST_EVENT, year: 2026 } },
    })

    await t.runtime.setActiveEvent("2025casj")
    const r = await outcome(() =>
      guard(EventRoute)({ context: context(t), location })
    )
    expect(r.error).toBeInstanceOf(UnsupportedSeasonError)
    expect((r.error as UnsupportedSeasonError).year).toBe(2025)
  })
})
