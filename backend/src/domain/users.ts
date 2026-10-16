// Accounts (REQUIREMENTS §3.1, §3.3). Credentials live in `users`; the directory entry each client
// syncs is the `user` record in the change log (guests never appear in it).
import type { Db } from "../db/db.js"
import { iso } from "../lib/clock.js"
import { uuidv7 } from "../lib/ids.js"
import { generatePassphrase, hashPassword } from "../lib/passwords.js"
import { problem } from "../lib/problem.js"
import type { Rec } from "./entities.js"
import type { Store } from "./store.js"

export interface UserRow {
  id: string
  username: string
  display_name: string
  role: "admin" | "scouter"
  active: number
  password_hash: string
  tokens_valid_after: number
  created_at: number
  updated_at: number
}

export class Users {
  constructor(
    private db: Db,
    private store: Store
  ) {}

  byId(id: string): UserRow | undefined {
    return this.db.get<UserRow>("SELECT * FROM users WHERE id = ?", id)
  }

  byUsername(username: string): UserRow | undefined {
    return this.db.get<UserRow>("SELECT * FROM users WHERE username = ?", username.trim())
  }

  all(): UserRow[] {
    return this.db.all<UserRow>("SELECT * FROM users ORDER BY display_name COLLATE NOCASE")
  }

  count(): number {
    return this.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM users")?.n ?? 0
  }

  activeAdmins(): number {
    return this.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1")?.n ?? 0
  }

  /** The directory record clients sync. */
  record(id: string): Rec | undefined {
    return this.store.live("user", id)
  }

  private publish(u: UserRow, actorId?: string, opId?: string): Rec {
    const prev = this.store.get("user", u.id)
    const rec: Rec = {
      id: u.id,
      rev: (prev?.rev ?? 0) + 1,
      updatedAt: iso(this.store.now()),
      username: u.username,
      displayName: u.display_name,
      role: u.role,
      active: u.active === 1,
    }
    this.store.put("user", rec, { actorId, opId, source: actorId ? "client" : "system" })
    return rec
  }

  async create(
    input: { username: string; displayName: string; role: "admin" | "scouter"; password?: string },
    actorId?: string,
    opId?: string
  ): Promise<{ user: Rec; passphrase: string }> {
    const username = input.username.trim()
    if (!/^[A-Za-z0-9._-]{2,40}$/.test(username))
      throw problem(422, "validation_failed", {
        errors: [{ path: "username", code: "invalid_format", message: "2–40 letters, digits, . _ -" }],
      })
    if (this.byUsername(username)) throw problem(409, "username_taken", { current: null })
    const passphrase = input.password ?? generatePassphrase()
    const hash = await hashPassword(passphrase)
    const now = this.store.now()
    const row: UserRow = {
      id: uuidv7(now),
      username,
      display_name: input.displayName.trim() || username,
      role: input.role,
      active: 1,
      password_hash: hash,
      tokens_valid_after: 0,
      created_at: now,
      updated_at: now,
    }
    const user = this.store.tx(() => {
      if (this.byUsername(username)) throw problem(409, "username_taken", { current: null })
      this.db.run(
        `INSERT INTO users (id, username, display_name, role, active, password_hash, tokens_valid_after, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, 0, ?, ?)`,
        row.id,
        row.username,
        row.display_name,
        row.role,
        row.password_hash,
        now,
        now
      )
      return this.publish(row, actorId, opId)
    })
    return { user, passphrase }
  }

  /** Role / active changes. Never demotes or deactivates the last active admin (409 last_admin). */
  update(
    id: string,
    patch: { role?: "admin" | "scouter"; active?: boolean; displayName?: string },
    actorId?: string,
    opId?: string
  ): { user: Rec; roleChanged: boolean; deactivated: boolean } {
    return this.store.tx(() => {
      const u = this.byId(id)
      if (!u) throw problem(404, "not_found", { current: null })
      const role = patch.role ?? u.role
      const active = patch.active ?? u.active === 1
      const losesAdmin = u.role === "admin" && u.active === 1 && (role !== "admin" || !active)
      if (losesAdmin && this.activeAdmins() <= 1)
        throw problem(409, "last_admin", { detail: "Keep at least one active admin", current: this.record(id) ?? null })
      const now = this.store.now()
      const next: UserRow = {
        ...u,
        role,
        active: active ? 1 : 0,
        display_name: patch.displayName?.trim() || u.display_name,
        updated_at: now,
      }
      const roleChanged = role !== u.role
      const deactivated = u.active === 1 && !active
      if (roleChanged || deactivated) next.tokens_valid_after = now
      this.db.run(
        "UPDATE users SET role = ?, active = ?, display_name = ?, updated_at = ?, tokens_valid_after = ? WHERE id = ?",
        next.role,
        next.active,
        next.display_name,
        now,
        next.tokens_valid_after,
        id
      )
      const changed = roleChanged || deactivated || next.active !== u.active || next.display_name !== u.display_name
      const user = changed ? this.publish(next, actorId, opId) : (this.record(id) ?? this.publish(next, actorId, opId))
      return { user, roleChanged, deactivated }
    })
  }

  async setPassword(id: string, password: string): Promise<void> {
    const hash = await hashPassword(password)
    this.db.run("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?", hash, this.store.now(), id)
  }

  /** Access tokens issued before now stop working (role change, revoke, deactivate). */
  invalidateTokens(id: string) {
    this.db.run("UPDATE users SET tokens_valid_after = ? WHERE id = ?", this.store.now(), id)
  }
}
