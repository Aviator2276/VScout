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
})
