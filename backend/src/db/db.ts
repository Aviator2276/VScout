// SQLite (node:sqlite) storage. One small server holds everything (REQUIREMENTS §13.2); WAL mode
// keeps reads concurrent with the single writer. Every write runs in `tx()`, and work that must
// happen only after commit (MQTT fan-out, SSE, push) is registered with `afterCommit`.
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { DatabaseSync } from "node:sqlite"
import type { SQLInputValue } from "node:sqlite"

const MIGRATIONS: string[] = [
  `
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin','scouter')),
    active INTEGER NOT NULL DEFAULT 1,
    password_hash TEXT NOT NULL,
    tokens_valid_after INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE guests (
    id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL UNIQUE,
    event_key TEXT NOT NULL,
    device_name TEXT,
    created_at INTEGER NOT NULL,
    last_login_at INTEGER NOT NULL
  );

  CREATE TABLE refresh_families (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    device_name TEXT,
    role TEXT NOT NULL,
    guest_event_key TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    revoked_at INTEGER
  );
  CREATE INDEX refresh_families_user ON refresh_families(user_id);
  CREATE INDEX refresh_families_device ON refresh_families(device_id);
  CREATE INDEX refresh_families_guest_event ON refresh_families(guest_event_key);

  CREATE TABLE refresh_tokens (
    token_hash TEXT PRIMARY KEY,
    family_id TEXT NOT NULL REFERENCES refresh_families(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    rotated_at INTEGER,
    next_token TEXT,
    next_expires_at INTEGER
  );
  CREATE INDEX refresh_tokens_family ON refresh_tokens(family_id);

  CREATE TABLE records (
    entity TEXT NOT NULL,
    id TEXT NOT NULL,
    event_key TEXT,
    author_id TEXT,
    rev INTEGER NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0,
    natural_key TEXT,
    content_hash TEXT,
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    PRIMARY KEY (entity, id)
  );
  CREATE UNIQUE INDEX records_natural ON records(entity, natural_key)
    WHERE deleted = 0 AND natural_key IS NOT NULL;
  CREATE INDEX records_event ON records(entity, event_key);

  CREATE TABLE change_log (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    scope TEXT NOT NULL,
    entity TEXT NOT NULL,
    record_id TEXT NOT NULL,
    rev INTEGER NOT NULL,
    op TEXT NOT NULL,
    audience TEXT NOT NULL DEFAULT 'all',
    exclude_user TEXT,
    envelope TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX change_log_scope ON change_log(scope, entity, seq);
  CREATE INDEX change_log_record ON change_log(scope, entity, record_id, seq);

  CREATE TABLE idempotency (
    user_id TEXT NOT NULL,
    key TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    state TEXT NOT NULL,
    status INTEGER,
    body TEXT,
    headers TEXT,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, key)
  );
  CREATE INDEX idempotency_created ON idempotency(created_at);

  CREATE TABLE audit (
    id TEXT PRIMARY KEY,
    event_key TEXT NOT NULL,
    at INTEGER NOT NULL,
    actor_id TEXT NOT NULL,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    record_id TEXT NOT NULL,
    reason TEXT
  );
  CREATE INDEX audit_event ON audit(event_key, at);

  CREATE TABLE push_subscriptions (
    device_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    platform TEXT,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    failures INTEGER NOT NULL DEFAULT 0,
    last_success_at INTEGER,
    last_failure_at INTEGER
  );
  CREATE INDEX push_subscriptions_user ON push_subscriptions(user_id);

  CREATE TABLE push_dedupe (key TEXT PRIMARY KEY, created_at INTEGER NOT NULL);

  CREATE TABLE tracked_events (
    event_key TEXT PRIMARY KEY,
    live INTEGER NOT NULL DEFAULT 1,
    added_at INTEGER NOT NULL,
    status TEXT
  );

  CREATE TABLE http_cache (
    url TEXT PRIMARY KEY,
    etag TEXT,
    last_modified TEXT,
    body TEXT NOT NULL,
    fetched_at INTEGER NOT NULL
  );
  `,
]

export type Row = Record<string, SQLInputValue>
type AfterCommit = () => void

export class Db {
  readonly raw: DatabaseSync
  private depth = 0
  private pending: AfterCommit[] = []
  private stmts = new Map<string, ReturnType<DatabaseSync["prepare"]>>()

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true })
    this.raw = new DatabaseSync(path)
    this.raw.exec("PRAGMA foreign_keys = ON")
    if (path !== ":memory:") {
      this.raw.exec("PRAGMA journal_mode = WAL")
      this.raw.exec("PRAGMA synchronous = NORMAL")
      this.raw.exec("PRAGMA busy_timeout = 5000")
    }
    this.migrate()
  }

  private migrate() {
    this.raw.exec("CREATE TABLE IF NOT EXISTS schema_version (v INTEGER NOT NULL)")
    const row = this.raw.prepare("SELECT v FROM schema_version").get() as { v: number } | undefined
    let v = row?.v ?? 0
    if (!row) this.raw.prepare("INSERT INTO schema_version (v) VALUES (0)").run()
    for (; v < MIGRATIONS.length; v++) {
      this.raw.exec("BEGIN")
      try {
        this.raw.exec(MIGRATIONS[v] ?? "")
        this.raw.prepare("UPDATE schema_version SET v = ?").run(v + 1)
        this.raw.exec("COMMIT")
      } catch (e) {
        this.raw.exec("ROLLBACK")
        throw e
      }
    }
  }

  private stmt(sql: string) {
    let s = this.stmts.get(sql)
    if (!s) {
      s = this.raw.prepare(sql)
      this.stmts.set(sql, s)
    }
    return s
  }

  get<T>(sql: string, ...params: SQLInputValue[]): T | undefined {
    return this.stmt(sql).get(...params) as T | undefined
  }

  all<T>(sql: string, ...params: SQLInputValue[]): T[] {
    return this.stmt(sql).all(...params) as T[]
  }

  run(sql: string, ...params: SQLInputValue[]) {
    return this.stmt(sql).run(...params)
  }

  /** Runs fn in a transaction (nested calls join the outer one). After-commit hooks run in order. */
  tx<T>(fn: () => T): T {
    if (this.depth > 0) {
      this.depth++
      try {
        return fn()
      } finally {
        this.depth--
      }
    }
    this.raw.exec("BEGIN IMMEDIATE")
    this.depth = 1
    let result: T
    try {
      result = fn()
      this.raw.exec("COMMIT")
    } catch (e) {
      this.raw.exec("ROLLBACK")
      this.pending = []
      throw e
    } finally {
      this.depth = 0
    }
    const hooks = this.pending
    this.pending = []
    for (const h of hooks) {
      try {
        h()
      } catch (e) {
        // fan-out failures never undo a committed write (REQUIREMENTS §9.6 rule 7)
        console.error("after-commit hook failed", e)
      }
    }
    return result
  }

  /** Registers work to run after the current transaction commits (immediately if none is open). */
  afterCommit(fn: AfterCommit) {
    if (this.depth === 0) fn()
    else this.pending.push(fn)
  }

  getMeta(key: string): string | undefined {
    return this.get<{ value: string }>("SELECT value FROM meta WHERE key = ?", key)?.value
  }

  setMeta(key: string, value: string) {
    this.run(
      "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      key,
      value
    )
  }

  close() {
    this.raw.close()
  }
}
