import { beforeEach, describe, expect, it } from "vitest"
import { MOCK_CREDENTIALS, mockBackend } from "../mock-backend"
import { seedDevData } from "../seed-dev"

const API = "http://localhost:8787/api/v1"

async function login(username: string) {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      password: MOCK_CREDENTIALS.password,
      deviceId: "d1",
      deviceName: "Test",
    }),
  })
  return {
    status: res.status,
    body: (await res.json()) as { user?: { role: string } },
  }
}

describe("dev mock accounts (pnpm mock:api)", () => {
  beforeEach(() => {
    mockBackend.reset()
    seedDevData()
  })

  it("alex signs in as the admin; sam as a scouter", async () => {
    expect((await login("alex")).body.user?.role).toBe("admin")
    expect(mockBackend.role).toBe("admin")
    expect((await login("sam")).body.user?.role).toBe("scouter")
    expect(mockBackend.role).toBe("scouter")
  })

  it("an unknown user is refused", async () => {
    expect((await login("nobody")).status).toBe(401)
  })

  it("alex and admin stay admins: restarts restore them, demotion is refused (owner)", async () => {
    expect((await login("admin")).body.user?.role).toBe("admin")
    // a saved state where alex was demoted, with a scouter session on a device
    const alex = [...mockBackend.users.values()].find(
      (u) => u.username === "alex"
    )
    if (!alex) throw new Error("no alex")
    mockBackend.users.set(alex.id, { ...alex, role: "scouter" })
    mockBackend.sessions.set("old", { userId: alex.id, role: "scouter" })
    seedDevData()
    expect(mockBackend.users.get(alex.id)?.role).toBe("admin")
    expect(mockBackend.sessions.get("old")?.role).toBe("admin")

    const { body } = await login("alex")
    expect(body.user?.role).toBe("admin")
    const res = await fetch(`${API}/admin/users/${alex.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "demote-1",
      },
      body: JSON.stringify({ role: "scouter" }),
    })
    expect(res.status).toBe(409)
  })
})
