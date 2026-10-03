import { getResponse } from "msw"
import { afterEach, describe, expect, it } from "vitest"
import { handlers } from "../mocks/handlers/handlers"
import { mockBackend } from "../mocks/mock-backend"
import { seedDevData } from "../mocks/seed-dev"

const API = "http://localhost:8787/api/v1"

async function call(path: string, init: RequestInit = {}) {
  const res = await getResponse(handlers, new Request(`${API}${path}`, init))
  if (!res) throw new Error(`no handler for ${path}`)
  return res
}

async function login(username: string) {
  const res = await call("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username,
      password: "correct horse 42",
      deviceId: "01900000-0000-7000-8000-00000000d001",
      deviceName: "test",
    }),
  })
  const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0] ?? ""
  const body = (await res.json()) as { accessToken: string }
  return { cookie, token: body.accessToken }
}

afterEach(() => mockBackend.reset())

describe("dev mock API: one session per device", () => {
  it("refresh answers each device with its own user (alex stays alex after sam signs in)", async () => {
    seedDevData()
    const alex = await login("alex")
    const sam = await login("sam")
    const refresh = async (cookie: string) =>
      (await (
        await call("/auth/refresh", { method: "POST", headers: { cookie } })
      ).json()) as { user: { username: string } }
    expect((await refresh(alex.cookie)).user.username).toBe("alex")
    expect((await refresh(sam.cookie)).user.username).toBe("sam")
    const none = await call("/auth/refresh", { method: "POST" })
    expect(none.status).toBe(401)
  })

  it("each request acts as its token's user; signing out ends only that device", async () => {
    seedDevData()
    const alex = await login("alex")
    const sam = await login("sam")
    const me = async (token: string) =>
      (await (
        await call("/me", { headers: { authorization: `Bearer ${token}` } })
      ).json()) as { user: { username: string } }
    expect((await me(alex.token)).user.username).toBe("alex")
    expect((await me(sam.token)).user.username).toBe("sam")
    await call("/auth/logout", {
      method: "POST",
      headers: { cookie: sam.cookie },
    })
    const samRefresh = await call("/auth/refresh", {
      method: "POST",
      headers: { cookie: sam.cookie },
    })
    expect(samRefresh.status).toBe(401)
    const alexRefresh = await call("/auth/refresh", {
      method: "POST",
      headers: { cookie: alex.cookie },
    })
    expect(alexRefresh.status).toBe(200)
  })
})
