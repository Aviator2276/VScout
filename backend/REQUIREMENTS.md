# VScout v2 Backend Requirements

> **This is a guideline; the backend may deviate. Coordinate changes with the frontend lead; the app
> absorbs differences in its adapter layer.**
>
> The app parses every response with its own schemas and maps it to its internal model in one adapter
> layer, so a renamed path or field is a small, local change on the app side. Optional features are
> discovered at runtime through `GET /meta` → `capabilities` (section 2.2), and the app degrades
> gracefully when one is missing. Tell the frontend lead what you changed; don't silently diverge.

**Audience:** whoever builds the VScout server.
**Status:** v2 (2026-10-01, round 3: MQTT request/response, guest login, reactions, admin-set team
number, push rules, capabilities).
**Framework:** your choice. This document defines **behavior and contracts only**, never code.
Paths and names may change (see the note above). Rules marked **MUST** protect data and sync
correctness; changing one needs agreement with the frontend lead first.

Words: **MUST** = the app breaks or loses data without it. **SHOULD** = strongly recommended.
**MAY** = optional.

---

## 0. How the system fits together

```
            ┌──────────────── static hosting ────────────────┐
            │  VScout PWA (TanStack Start, SPA mode)          │  plain files + service worker
            └───────────────┬────────────────────────────────┘
                            │ same site (e.g. app.example.org / api.example.org)
   HTTPS (requests)          WSS (MQTT 5: live hints + the same requests as RPC)      Web Push (alerts)
                            │                         │                              ▲
┌───────────────────────────▼──────────┐   ┌──────────▼─────────┐    ┌───────────────┴────────┐
│  HTTP API                            │──▶│  MQTT broker       │    │ Apple / Google / Mozilla│
│  auth · sync · writes · media · push │   │  (EMQX recommended)│    │ push services           │
│  change log (source of truth)        │   └────────────────────┘    └────────────────────────┘
│  import jobs: TBA, Statbotics, Nexus │──────────── push sender (VAPID) ─────────▲
└──────────────────────────────────────┘
```

Principles the whole design rests on:

1. **The app is offline-first.** Phones keep a full local copy of the event (IndexedDB). They
   read only from it, and they queue writes while offline and send them later, sometimes days later.
2. **The HTTP change log is the source of truth.** Every change to any record is appended to a
   per-scope change log that clients pull with a cursor. **MUST:** no data ever exists only on MQTT.
3. **MQTT fan-out is a hint channel.** It pushes changes to connected clients quickly, but clients
   assume they missed things and always re-pull the change log after reconnecting. The app must work
   with MQTT blocked entirely (venue proxies do this).
4. **HTTP and MQTT are interchangeable for requests.** Every API request also works as an MQTT 5
   request/response (section 9.10) with the same format and data, except a short HTTP-only list. The app
   picks the transport per request and asks again over the other one if a request is slow, blocked or
   lost. Idempotency keys make that safe.
5. **Web Push is an alert, never data.** A notification makes the user open the app, and the app then syncs
   over HTTP.
6. **Clients create their own ids** (UUIDv7) and retry requests freely. The server **MUST** make
   every write idempotent.
7. **The season game is swappable.** Game-specific scouting data is an opaque JSON payload with a
   `gameId` and `schemaVersion`. The server **MUST NOT** hard-code game fields (no "fuel", "coral" and so on in
   tables or code).

---

## 1. What you need to run

| Component | Required | Notes |
|---|---|---|
| HTTP API | MUST | Sections 2–8 |
| Database | MUST | Relational recommended (JSON column for game payloads and user settings) |
| MQTT broker | MUST | MQTT **5.0 over secure WebSockets**, reachable from the internet (phones connect over cellular; there's no venue LAN server). **EMQX 5 single node recommended** (section 9.8). Mosquitto 2 + `mosquitto-go-auth` is the fallback |
| Push sender | MUST | Web Push with VAPID (section 10). Libraries exist for every language (`web-push`, `pywebpush`, `webpush-go`, …) |
| Background jobs | MUST | TBA, Statbotics and Nexus imports, push fan-out, pruning (section 11) |
| Object storage | MUST | Robot photos. Match videos later |
| Static hosting for the PWA | MUST | HTTPS, specific cache headers (section 13.1) |
| Scheduler | SHOULD | "Match coming up" notifications from live FRC Nexus estimates (approved, section 10.3) |

One team (~60–100 devices, one event at a time) is the expected load. A single small VPS is
enough.

---

## 2. Conventions (all HTTP endpoints)

- **Base URL:** `https://<api-host>/api/v1`. JSON, UTF-8, **camelCase** field names.
- **Same site as the PWA** (e.g. `app.example.org` + `api.example.org`). This is decided, because the refresh
  token is an HttpOnly cookie (section 3).
- **Compression MUST** be on (gzip or brotli). The first sync of an event is 2–6 MB of JSON over venue Wi-Fi.
- **CORS:** allow the PWA origin with credentials. Allow the headers `Authorization`, `Idempotency-Key`,
  `If-Match`, `X-Client-Version`, `Content-Type`. Expose `Retry-After`, `Date`, `ETag`.
- **Auth header:** `Authorization: Bearer <accessToken>` on everything except login, guest login,
  refresh, `/meta` and the VAPID public key. Over MQTT RPC the same header travels inside the request
  payload (section 9.10).
- **Client version:** every request carries `X-Client-Version: <semver>`. See the version gate below.
- **Time:** ISO 8601 UTC with milliseconds. Send a correct `Date` header, because clients estimate clock skew from it.
- **IDs:**
  - Client-created records use **UUIDv7** strings, and the server **MUST accept the client's id**.
  - Reference data uses natural keys: event `2026casj`, match `2026casj_qm12`, team `254`.
- **Revisions:** every record has `rev`, an integer starting at 1 that increases by 1 on every change
  to *that record*. **MUST.** The whole sync protocol depends on it.

### 2.1 Errors: RFC 9457 `application/problem+json`

```json
{ "type": "https://vscout.app/errors/rev_conflict", "title": "Revision conflict", "status": 409,
  "code": "rev_conflict", "detail": "…", "requestId": "…",
  "errors": [ { "path": "data.auto.startPosition", "code": "invalid_enum", "message": "…" } ],
  "current": { "…full current server record, or null…" } }
```

- `code` is a stable machine string. The app branches on `code` only.
- `errors[]` is present on 400 and 422.
- `current` is present on **every 409**, and on 404 for update or delete.

| Status | `code`s | What the app does |
|---|---|---|
| 400 / 422 | `validation_failed`, `unknown_game`, `unsupported_schema_version`, `idempotency_key_reuse`, `media_missing`, `invalid_endpoint`, `invalid_keys` | Shows the error; the user fixes or discards it |
| 401 | `token_expired`, `token_invalid`, `refresh_invalid`, `invalid_guest_code` | Refreshes once and retries, otherwise asks the user to log in (guest code: "That code didn't work") |
| 403 | `forbidden`, `not_author`, `role_required`, `guest_access_disabled` | Rejects the change locally |
| 404 | `not_found`, `unknown_subscription` | Treats the record as deleted |
| 409 | `rev_conflict`, `deleted`, `duplicate`, `already_exists`, `request_in_progress`, `guest_code_taken` | Shows the conflict UI using `current` (guest code: generates another) |
| 410 | `cursor_expired` | Re-downloads that scope |
| 413 | `payload_too_large`, `rpc_too_large` | Rejects (`rpc_too_large`: retries over HTTP) |
| 426 | `upgrade_required` | Asks the user to update the app; writes stay queued |
| 429 | `rate_limited` + `Retry-After` | Backs off |
| 5xx / 503 + `Retry-After` | any | Retries later with the **same** Idempotency-Key |

### 2.2 Version gate

- `GET /meta` (no auth) → `{ apiVersion: 1, minClientVersion, serverTime, activeGameId, gameSchemaVersions: { [gameId]: number[] }, capabilities }`.
- **`capabilities`** tells the app which optional features exist. A missing key means "not
  supported", and the app hides or falls back:

  | Key | Meaning |
  |---|---|
  | `mqttRpc` | Every non-HTTP-only endpoint answers over MQTT RPC (section 9.10) |
  | `guestLogin` | `POST /auth/guest` exists (section 3.4) |
  | `reactions` | The `reaction` entity exists (section 5.8) |
  | `readMarkers` | `PUT /me/read-markers` exists and pushes carry `app_badge` (section 10.2) |
  | `matchPush` | "Match coming up" pushes are sent (section 10.3) |
  | `restore` | `POST /{collection}/{id}/restore` exists (section 7.3) |
  | `batchPush` | `POST /sync/push` exists (section 7.4) |
  | `demoSeed` | Admin demo events exist: `POST /admin/demo-events` (body: a generated bundle of teams, matches, entries, comments, picklists, announcements, messages, in the normal entity shapes, ≤ 5 MB) creates event `demo-<seed>` with `isDemo: true`; `DELETE /admin/demo-events/{eventKey}` deletes it and everything in it. Admin only. Demo events never send push. Without this capability the app runs demos on the device only |
- If `X-Client-Version < minClientVersion`, every endpoint except `/auth/*` and `/meta` returns
  `426 upgrade_required` with `minVersion`.
- The same `minClientVersion` is published on MQTT `vscout/sys/status` (section 9).

---

## 3. Authentication and accounts

### 3.1 Accounts

- **No self-signup.** Admins create accounts. The server generates the initial password as a
  readable passphrase: three words plus two digits, about 40 bits of entropy.
- Roles: `admin`, `scouter`, `guest` (section 4).
- Users can change their own password online.

### 3.2 Tokens (MUST)

| Token | Lifetime | Where it lives |
|---|---|---|
| Access token (JWT) | 15 min | App memory. Sent as `Bearer` and as the MQTT password |
| Refresh token | **at least 7 days, sliding** (30 suggested) | **HttpOnly; Secure; SameSite=Strict** cookie scoped to `/api/v1/auth`. Never in a response body |

Why: scouters go offline for whole event days and must still be able to sync queued work when
they reconnect. The app warns users 48 h before the refresh token expires, using `refreshExpiresAt`,
because it can't read the cookie.

**Rotation with grace (MUST):** every refresh issues a new refresh token and invalidates the old one, **but
the old one stays valid for 60 seconds** and returns the same new token if replayed. Venue Wi-Fi
drops responses, and without the grace period a lost response logs the user out mid-event.

**Access token claims (MUST):**

```json
{ "sub": "<userId>", "role": "scouter", "cid": "vscout-<userId>-<deviceId>",
  "iat": 0, "exp": 0, "acl": [ "…only if the broker reads ACLs from the token (EMQX), section 9.3…" ] }
```

`cid` binds the token to one MQTT connection (section 9.2). `deviceId` comes from the login request.

**Signing (SHOULD): RS256 with a JWKS endpoint** (e.g. `/.well-known/jwks.json`), so the broker
verifies tokens without holding a shared secret. A shared HMAC secret between API and broker is an
acceptable fallback; it's your call.

### 3.3 Endpoints

| Endpoint | Auth | Behavior |
|---|---|---|
| `POST /auth/login` `{ username, password, deviceId, deviceName }` | none | `200 { accessToken, accessExpiresAt, refreshExpiresAt, user: { id, username, displayName, role, teamNumber } }` + `Set-Cookie` refresh. `401 invalid_credentials`. `429` after repeated failures |
| `POST /auth/guest` `{ code, deviceId, deviceName }` | none | Guest session for the event the guest code belongs to (section 3.4). Same response shape as login with `role: 'guest'`, plus `eventKey`. `401 invalid_guest_code`; `429` when rate-limited |
| `POST /auth/refresh` (empty body + cookie) | cookie | Same shape as login plus `deviceId` (the device this cookie's token family belongs to; the app re-learns it after clearing its cache), and a new cookie. `401 refresh_invalid` → the app sends the user to the login screen |
| `POST /auth/logout` `{ deviceId }` | bearer | Revokes this device's refresh family, clears the cookie, **deletes this device's push subscription**. `204` |
| `GET /me` | bearer | `{ user, permissions?: string[], serverTime, refreshExpiresAt }`. Called at boot to pick up role changes |
| `POST /me/password` `{ currentPassword, newPassword }` | bearer | Online only |
| `GET /admin/users`, `POST /admin/users` | admin | List users; create a user and return the generated passphrase once |
| `PATCH /admin/users/{id}` `{ role?, active?, scouterLevel? }` | admin | A role change publishes MQTT inbox `roleChanged`. `scouterLevel` is written into **that user's `userSettings`** (section 5.4) |
| `POST /admin/users/{id}/revoke-sessions` | admin | Revokes all refresh families. Publishes inbox `sessionRevoked`. Deletes their push rows |

All writes accept `Idempotency-Key` (section 7.1). All `/auth/*` endpoints are **HTTP-only** (the
refresh token is a cookie); everything else in this table is also available over MQTT RPC (section 9.10).

### 3.4 Guest sessions

The login screen has a "Continue as guest" button that asks for a **guest code**. Guests have no account.

- **Guest code:** each event has `eventSettings.guestAccess = { enabled, code, rotatedAt }` (default
  `{ enabled: false, code: null, rotatedAt: null }`). `code` is 6 characters from the alphabet
  `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` (no 0/O/1/I), compared case-insensitively. The app generates it
  when an admin enables access or taps "Generate new code", and saves it with
  `PUT /events/{eventKey}/settings`. You MUST validate the format (`422 validation_failed`), set
  `rotatedAt`, and reject a code that another event with guest access on already uses
  (`409 guest_code_taken`).
- `POST /auth/guest { code, deviceId, deviceName }` looks up the event whose enabled guest access has
  that code. It creates (or, for the same `deviceId`, reuses) a guest user id and a refresh family,
  sets the same refresh cookie as a login, and returns a token with `role: 'guest'` scoped to that
  one event (return `eventKey` too). One guest session per device.
- A wrong or unknown code, or a disabled event → `401 invalid_guest_code` (the same code for all
  three, so responses don't reveal which codes exist). **Rate-limit wrong codes per IP and per
  `deviceId`** (e.g. 5 per 10 minutes) → `429 rate_limited` + `Retry-After`.
- A guest token may only read its event; anything else → `403 guest_access_disabled`.
- **When an admin turns guest access off or changes the code:** revoke every guest refresh family for
  that event, publish inbox `forceLogout { reason: 'guest_access_disabled' }` (off) or
  `{ reason: 'guest_code_rotated' }` (new code) to each guest, and delete their push subscriptions.
- What guests can do is in section 4. Guests never appear in the user directory.
- ⚠ **Security:** while guest access is on, anyone who has the app's URL **and the code** can read the
  team's scouting data, picklists and comments for that event. The code is readable by the whole team
  (it's in `eventSettings`), so treat it as shareable, not secret. That's the owner's accepted
  trade-off; keep the default off, rate-limit codes, and make sure chat and DMs never reach guests
  (sections 6.1, 9.5).

---

## 4. Roles and permissions

The server is the authority. The app only hides buttons.

| Action | admin | scouter | guest |
|---|---|---|---|
| Read event data (scouting, comments, picklists, teams, matches, announcements) | ✅ | ✅ | ✅ (only the event of their guest code) |
| Read **event-channel chat** | ✅ | ✅ | ❌ |
| Read **private** comments (personal notes) | own only | own only | — |
| Read **direct messages** | own conversations only | own conversations only | ❌ (guests have no DMs) |
| Create scouting, pit, post entries, comments, picklists, event-channel messages | ✅ | ✅ | ❌ |
| Edit/delete own records | ✅ | ✅ | ❌ |
| Edit/delete **anyone's** records (moderation) | ✅ | ❌ | ❌ |
| React to announcements (create/delete own `reaction`) | ✅ | ✅ | ✅ (the **only** guest write) |
| React to chat messages (event channel; DMs as a participant) | ✅ | ✅ | ❌ |
| Publish MQTT presence and typing | ✅ | ✅ | ❌ |
| Live alliance board: pick, decline, undo own last action (board unlocked) | ✅ | ✅ | ❌ |
| Live alliance board: lock/unlock, reset, set status, record while locked, undo anyone's action | ✅ | ❌ | ❌ |
| Event settings (followed picklist, recommender constants, game overrides, **guest access**) | ✅ | ❌ | ❌ |
| Team settings (the team's own number, set once for everyone) | ✅ | ❌ | ❌ |
| Announcements and urgent pings | ✅ | ❌ | ❌ |
| User management | ✅ | ❌ | ❌ |
| Update **own** `userSettings` | ✅ | ✅ | ❌ (guest preferences stay on the device) |

Guests: **every write returns `403 role_required`**, except creating/deleting their own reaction on an
announcement.
Editing your own or (as admin) anyone's records is allowed even after the event ends.

SHOULD: expose the permission map (e.g. `GET /meta/permissions` → role → actions) so a CI test
can detect drift between the server and the app.

---

## 5. Data model

### 5.1 Entities

| `entity` (wire name) | Scope | Owner | Client-writable | Unique per (natural key) | Source |
|---|---|---|---|---|---|
| `event` | global | server | no | eventKey | TBA |
| `team` | global | server | no | team number | TBA |
| `user` | global (directory: id, displayName, role) | server | no (admin endpoints) | id | backend |
| `eventTeam` | event | server | no | (eventKey, team) | TBA rankings + Statbotics + Nexus pit locations |
| `match` | event | server | no | matchKey | TBA schedule/results + Nexus queue times |
| `userSettings` | user | that user | `PATCH /me/settings` (not guests) | userId | client |
| `teamSettings` | global (singleton id `team`) | admin | `PUT /team-settings` (admin) | — | client. `{ teamNumber }`, section 5.6 |
| `scoutEntry` | event | author | yes | (eventKey, matchKey, teamNumber, authorId) | client |
| `pitScouting` | event | author | yes | (eventKey, teamNumber, authorId) | client (**per event**) |
| `postScouting` | event | author | yes | (eventKey, teamNumber, authorId) | client |
| `allianceRank` | event | author | yes | (eventKey, matchKey, alliance, authorId) | client (reserved, later) |
| `comment` | event | author | yes | id | client. `visibility: 'team' \| 'private'` |
| `message` | event | author | yes | id | client. Channel `event:{eventKey}` or DM `dm:{userA}:{userB}`. `kind: 'message' \| 'announcement'`, `priority?: 'urgent'` (admin) |
| `reaction` | event | author | yes (guests: announcements only) | (targetType, targetId, authorId, emoji) | client. Section 5.8 |
| `picklist` | event | author | yes | id | client. **Per user**; there are no shared picklists |
| `picklistEntry` | event | picklist author | yes | (picklistId, teamNumber) | client. Ordered with a fractional-index string, plus a `reason` |
| `eventSettings` | event | admin | yes (admin) | eventKey | client. Server creates rev 1 when an event is set up |
| `allianceBoard` | event | shared | **actions endpoint only, online** | eventKey | client. Server creates it per event |
| `mediaAsset` | event | author | via upload | id | client |

**Every owned record** has `id, rev, eventKey, authorId, createdAt, updatedAt`. The server **sets**
`authorId` (from the token), `createdAt`, `updatedAt` and `rev`, and ignores client values for these.

### 5.2 Game payloads (MUST NOT hard-code game fields)

Records holding season data (`scoutEntry`, `pitScouting`, `postScouting`, `allianceRank`) carry
`gameId` (e.g. `2026-rebuilt`), `schemaVersion` (integer) and `data` (object).

- Store `data` as opaque JSON.
- **SHOULD** validate `data` against the JSON Schema the app publishes per game version
  (`app/src/games/<gameId>/schema.v<N>.json`, generated from the app's zod schemas). Reject with
  `422 validation_failed` and per-field `errors[]`.
- Unknown `(gameId, schemaVersion)` → `422 unsupported_schema_version`. **Never silently drop data.**
- Advertise supported versions in `GET /meta` → `gameSchemaVersions`.

### 5.3 Event settings (admin singleton per event)

Includes:
- `followedPicklistId`: one user's picklist that the team follows. It's a pointer, not a copy.
- `recommender`: constants for the "needs scouting" recommendations.
- `gameOverrides`: per-event overrides of game constants, e.g. ranking-point thresholds at offseason
  events. Validated by the game module's schema.
- `postScouting.openEarly`: boolean.
- `metricWeights`: picklist weighting.
- `guestAccess`: `{ enabled, code, rotatedAt }`, default disabled (section 3.4).

Treat everything except `followedPicklistId` and `guestAccess` as opaque JSON with schema validation.
Changing `guestAccess.enabled` to false or changing `guestAccess.code` triggers the guest revocation in
section 3.4.

### 5.4 User settings (one JSON document per user)

Synced across a user's devices: home layout, scouter level (`new`/`experienced`), theme, watched
teams, team-list columns, notification preferences (section 10.3), glossary preferences,
`lastActiveEventKey` (the default event for a new or wiped device), …

Guests have no settings document: `GET`/`PATCH /me/settings` → `403 role_required`.

- `GET /me/settings` → the record. Normally clients get it through `/sync/changes?scope=user`.
- `PATCH /me/settings` `{ baseRev, patch }`. `patch` is a JSON merge patch of top-level keys.
  `200` + full record (rev+1).
- **MUST store and return unknown keys unchanged**, so an older app version never deletes keys a newer one wrote.
- `409 rev_conflict` + `current` on a `baseRev` mismatch. The app re-applies its keys and retries.
- Published only on the user's private MQTT topic (section 9.5).

### 5.5 Live alliance selection board

One board per event that every user watches live:
- `status`: `notStarted | inProgress | done`
- `locked`: boolean
- `alliances`: seed → picks
- `declined` teams
- an action `history[]` with `actorId` and `at`

Section 7.5 covers how it's written.

### 5.6 Team settings (admin singleton, global)

`{ teamNumber }`: the team's own FRC number, set **once by an admin for everyone** (not per user).
Every "our matches" feature and the "match coming up" push use it. `PUT /team-settings { baseRev,
record }` (admin, `409` on a stale `baseRev`). It's a global-scope entity in the change log and is
published on `vscout/global/data/teamSettings`.

### 5.7 Messages: chat vs announcements

- `kind: 'message'` in channel `event:{eventKey}` is event chat: admins and scouters only.
- `kind: 'announcement'` is readable by everyone, guests included.
- DMs (`dm:{a}:{b}`) are readable only by the two participants (not even admins).

### 5.8 Reactions

`{ id, eventKey, targetType: 'message' | 'announcement', targetId, emoji, authorId }`.
- `targetType: 'announcement'` targets a message with `kind: 'announcement'`; `targetType: 'message'`
  targets a chat message in the event channel **or a DM**. A mismatch → `422`.
- `emoji` is one of `👍 ❤️ 🎉 😂 😮 👀`; anything else → `422 validation_failed`.
- Unique per (target, author, emoji): a duplicate → `409 duplicate` + `current`. Clients toggle:
  create to add, delete to remove. No update.
- Admins and scouters may react to any message or announcement they can read (DMs only as a
  participant). Guests may react only to announcements (`403 role_required` otherwise).
- **Visibility follows the target:** announcement reactions are readable by everyone (guests
  included), event-chat reactions by admins and scouters, **DM reactions only by the DM's two
  participants** (filter them in the change log like DMs, and publish them only on the two user
  topics, section 9.5).
- Create `POST /events/{eventKey}/reactions`, delete `DELETE /reactions/{id}?baseRev=n` (author; admins
  may moderate announcement and event-chat reactions, not DM reactions).
- Reactions never trigger a push.

---

## 6. Reading: the sync API (MUST)

### 6.1 `GET /sync/changes`

| Param | Meaning |
|---|---|
| `scope` | `global` · `user` (the caller's own) · `event:<eventKey>` |
| `entities` | comma-separated entity names within the scope |
| `cursors` | map `{ entity: cursor }` (JSON or base64url). Missing or empty = start from scratch (bootstrap) |
| `limit` | default 500, max 2000 |

```json
{ "changes": [ /* ChangeEnvelope[], in commit order */ ],
  "cursors": { "match": "opaque", "scoutEntry": "opaque" },
  "hasMore": true, "serverTime": "…" }
```

**The `ChangeEnvelope`.** The same shape is used on HTTP and MQTT:

```ts
{
  v: 1,
  entity: string,            // section 5.1 wire name
  op: 'upsert' | 'delete',
  id: string,                // record id ("254" for teams)
  rev: number,
  eventKey: string | null,   // null for user/global entities
  ts: string,                // server time of this revision
  actorId?: string,          // who caused it (absent for imports)
  opId?: string,             // the Idempotency-Key of the write that produced this rev
  data?: object              // FULL record for upsert; omitted for delete
}
```

Rules (all **MUST**):

1. **The cursor is an opaque position in a per-scope change log** (e.g. a global sequence number).
2. **Never skip a change.** Duplicates are fine, since clients ignore any `rev ≤` what they have.
3. **Full records only**, never patches.
4. **Deletes appear as `op: 'delete'`** and are kept in the log for **at least 30 days**. An older cursor → `410 cursor_expired`.
5. **Authorization filtering:** return only what the caller may read (section 4). Private comments go only to their
   author, and DMs only to their two participants. **Guests** get no event-channel chat messages and no
   reactions on chat messages (they do get announcements and announcement reactions). When a record's audience shrinks (e.g. a comment
   switched to private), send `op: 'delete'` to whoever lost access.
6. **Imports must not bump `rev` when nothing changed.** Re-importing identical TBA/Statbotics data
   that bumps revisions makes every phone re-download the event on every poll.
7. **`opId` echo:** when a client write produces a rev, that envelope carries the request's
   Idempotency-Key as `opId`. The app uses it to recognize its own write and avoid a false conflict.

### 6.2 Bootstrap

With no cursor, return the **current state**: the latest rev of each live record, no deleted
records, paged in a stable order. The final page's cursor **MUST** be the change-log position
taken **before** the snapshot began, so anything committed during paging is replayed on the next
call. There's no separate snapshot endpoint. Expect ~6,000 records per event.

A phone whose local storage was wiped (iOS does this) simply bootstraps again, so this path
**MUST** be reliable and reasonably fast.

### 6.3 Other reads

- `GET /channels/{channelId}/messages?before=<iso>&limit=100` → older chat history on demand (the app
  keeps 14 days locally). Same visibility rules as the change log. Guests → `403 role_required`.
- `GET /events/{eventKey}/admin/audit?before=&limit=` (admin) → moderation history.
- `GET /events/{eventKey}/pit-map` → `{ rev, imageUrl, pits: [{ teamNumber, x, y, w, h }] }` with
  `ETag` / `If-None-Match`. It MAY instead be a `pitMap` entity in the change log (preferred).

---

## 7. Writing (MUST)

Every client write is a **request**: an HTTP request, or the identical MQTT RPC request (section 9.10).
**Clients never publish data to fan-out topics** and never fire-and-forget a write.

### 7.1 Idempotency

- Every `POST`/`PUT`/`PATCH`/`DELETE` carries `Idempotency-Key: <uuid>`.
- The server stores `(userId, key) → (request hash, status, response body)` for **at least 7 days**.
  A phone can sit offline through a whole event weekend and then replay.
- Same key + same body → **replay the stored response** (same status and body), even if the record has changed since.
- Same key + different body → `422 idempotency_key_reuse`.
- Same key still in flight → `409 request_in_progress` + `Retry-After: 1`.

### 7.2 Optimistic concurrency

Updates and deletes send `baseRev`, either in the body or as `If-Match: "<rev>"`; pick one.
A mismatch → `409 rev_conflict` with `current`. Updating a deleted record → `409 deleted`, `current: null`.

### 7.3 Endpoints (paths are yours to rename; semantics are fixed)

| Operation | Request | Success |
|---|---|---|
| Create | `POST /events/{eventKey}/{collection}`, body = full record including the client `id` | `201` + full record (`rev: 1`) |
| Update | `PUT /{collection}/{id}` `{ baseRev, record }` (full replacement) | `200` + full record (rev+1) |
| Delete | `DELETE /{collection}/{id}?baseRev=n` | `200 { id, rev, deletedAt }` |
| **Restore (undo)** | `POST /{collection}/{id}/restore` `{ baseRev: <deleted rev> }` within 30 days | `200` + full record (rev+1), **same id** |
| Event settings | `PUT /events/{eventKey}/settings` `{ baseRev, record }` | admin only. Disabling guest access or changing the guest code triggers the guest revocation in section 3.4 |
| Team settings | `PUT /team-settings` `{ baseRev, record }` | admin only (section 5.6) |
| Reactions | `POST /events/{eventKey}/reactions`, `DELETE /reactions/{id}?baseRev=n` | section 5.8 |
| User settings | `PATCH /me/settings` | section 5.4 |

Collections: `scout-entries`, `pit-scouting`, `post-scouting`, `alliance-ranks`, `comments`,
`messages`, `reactions`, `picklists`, `picklist-entries`, `media`.

Rules:
1. **The response body is authoritative.** The app replaces its local copy with it.
2. A natural-key violation (section 5.1) → `409 duplicate` + `current`.
3. `POST` with an id that already exists under a different key → `409 already_exists` + `current`.
   An id that's deleted → `409 deleted` (the app then calls restore).
4. A non-author, non-admin editing an owned record → `403 not_author`. Guests → `403 role_required`
   (except their own announcement reactions).
5. **After commit:** append the envelope to the change log, **then** publish it on MQTT (section 9), and
   trigger push if applicable (section 10). Never publish uncommitted data.
6. Messages: `priority: 'urgent'` and announcements are admin-only.

### 7.4 Optional: batch

`POST /sync/push { ops: [{ opId, method, path, baseRev?, body? }] }` → `{ results: [{ opId, status, body }] }`,
with each op processed independently using the same idempotency rules. MAY be added later; the app works without it.

### 7.5 Live alliance board actions (online only)

`POST /events/{eventKey}/alliance-board/actions`, with `Idempotency-Key` = action id:

```json
{ "id": "<uuid>", "baseRev": 12, "action": { "kind": "pick", "seed": 1, "team": 254 } }
```

Action kinds:
- `pick { seed, team }`
- `decline { team }`
- `undo { actionId }`
- `reset`
- `setStatus { status }`
- `lock`
- `unlock`

The response is the full board (rev+1), also published on MQTT.

These actions are **online-only** and latency-sensitive: the app sends them **over MQTT RPC first**
when connected, and falls back to HTTP (section 9.10). Answer them fast.

- Permissions are in section 4. While `locked`, only admins may record.
- `baseRev` mismatch → `409 rev_conflict` + `current`. The app shows "Already recorded by Alex" when
  `current` already contains the same pick, so two people recording the same real pick is harmless.
- Each action is stored in `history[]` with `actorId` and `at`.

---

## 8. Media

Media upload and download are **HTTP-only** (never over MQTT RPC).

### 8.1 Robot photos (upload)

`POST /events/{eventKey}/media`, `multipart/form-data`, with fields `id` (UUIDv7), `kind=robotPhoto`,
`teamNumber` and `file`, plus an `Idempotency-Key` header →
`201 { id, url, thumbUrl, mime, bytes, width, height, rev }`.

- Max 10 MB. `image/jpeg` or `image/webp` (the app compresses to ~1600 px).
- Generate a thumbnail.
- Pit entries reference photos by id. Referencing an id that wasn't uploaded → `422 media_missing`.
  The app uploads photos first.
- Each upload adds a `mediaAsset` envelope to the change log. `DELETE /media/{id}` (author or admin) removes it.
- The image host **MUST** allow CORS from the PWA origin.

### 8.2 Match videos (later)

`GET /events/{eventKey}/matches/{matchKey}/videos` →
`{ items: [{ sourceId, kind, mime: 'video/mp4', bytes, quality, url, expiresAt? }] }`, and optionally
`GET /events/{eventKey}/videos` for a whole event.
- **Direct MP4 URLs**, never YouTube pages.
- `Accept-Ranges: bytes` and `Content-Length`, so downloads can resume.
- CORS for the PWA origin.
- Signed URLs MUST include `expiresAt`.

---

## 9. MQTT

### 9.1 Broker

| Item | Requirement |
|---|---|
| Protocol | MQTT **5.0** |
| Transport | `wss://<host>/mqtt` (WebSocket subprotocol `mqtt`). Plain `ws://` only in development |
| Proxy | If behind a reverse proxy: WebSocket upgrade enabled, **idle timeout ≥ 90 s** (client keepalive is 30 s) |
| Limits | max packet **≥ 1 MiB** (RPC responses, section 9.10), clientId length ≥ 128, keepalive 10–120 s accepted |
| Reachability | Public internet (phones connect over cellular). There's no venue LAN deployment |
| Sessions | Clients use `clean start = true`, session expiry 0. **No persistent client sessions needed** |
| Retained messages | Persist them across restarts (only `sys/status` and presence are retained) |
| Your own client | Service account with publish rights, clientId like `vscout-api-<instance>`, **unlimited reconnects** |

### 9.2 Client authentication (MUST)

Clients connect with `username = userId`, `password = access token`, and
`clientId = vscout-{userId}-{deviceId}`. Reject with reason **134/135** unless:
1. the JWT signature is valid and it isn't expired,
2. `sub == username`,
3. `cid == clientId`. This stops one user from taking over another's connection. The minimum is checking the
   `vscout-{sub}-` prefix,
4. *(if the broker calls back to the API)* the user is active and not revoked.

When the token expires while connected, the broker SHOULD disconnect the client (EMQX
`disconnect_after_expire = true`). The client then refreshes and reconnects, so role changes
apply within 15 minutes. With a broker that can't do this, publish inbox `sessionRevoked` /
`roleChanged` to force a reconnect.

### 9.3 Access control (MUST; default deny)

`{me}` = the connecting user.

| Topic filter | admin | scouter | guest |
|---|---|---|---|
| `vscout/sys/status` | sub | sub | sub |
| `vscout/global/data/#` | sub | sub | sub |
| `vscout/event/+/data/#` | sub | sub | sub |
| `vscout/event/+/chat/#` | sub | sub | — |
| `vscout/event/+/control` | sub | sub | sub |
| `vscout/event/+/presence/#` | sub | sub | — |
| `vscout/event/+/presence/{me}/+` | pub | pub | — |
| `vscout/event/+/typing/+/+` | sub | sub | — |
| `vscout/event/+/typing/+/{me}` | pub | pub | — |
| `vscout/event/+/admin/#` | sub | — | — |
| `vscout/user/{me}/#` | sub | sub | sub |
| `vscout/rpc/req/{me}/+` | pub | pub | pub |
| `vscout/rpc/res/{me}/+` | sub | sub | sub |

Only the service account publishes to `sys`, `global`, `event/+/data`, `event/+/chat`,
`event/+/control`, `event/+/admin`, `user/+` and `rpc/res/+/+`, and it subscribes to
`$share/api/vscout/rpc/req/+/+`. Denials must **not** disconnect: SUBACK/PUBACK 135, QoS 0 silently dropped.

With EMQX, put this list in the token's `acl` claim using `${username}` placeholders and set
`authorization.no_match = deny`. With Mosquitto + go-auth, implement HTTP auth/ACL hooks and **enable
the ACL cache** (it checks every delivery).

### 9.4 Topics

| Topic | Payload | QoS | Retain | Published when |
|---|---|---|---|---|
| `vscout/sys/status` | `{ v:1, minClientVersion, maintenance, message, ts }` | 1 | **yes** | Startup, version or maintenance change |
| `vscout/global/data/{entity}` | ChangeEnvelope (`event`, `team`, `user`) | 0 | no | After commit |
| `vscout/event/{eventKey}/data/{entity}` | ChangeEnvelope | see below | no | After commit of an event record **every role may read** (incl. announcements and their reactions) |
| `vscout/event/{eventKey}/chat/{entity}` | ChangeEnvelope (`message` with `kind:'message'`, `reaction` on a chat message) | see below | no | After commit of event-channel chat. **Guests can't subscribe** |
| `vscout/event/{eventKey}/control` | `{ v:1, cmd:'resync', entities:[…], reason, ts }` or `{ v:1, cmd:'reload', minClientVersion, ts }` | 1 | no | Bulk changes, admin "force resync", new app release |
| `vscout/event/{eventKey}/presence/{userId}/{deviceId}` | Presence (clients publish) | 1 | yes | By clients and their Last Will |
| `vscout/event/{eventKey}/typing/{channelId}/{userId}` | Typing (clients publish) | 0 | no | By clients |
| `vscout/event/{eventKey}/admin/alerts` | `{ v:1, kind, message, ts, detail }` | 1 | no | Import failures, sync problems |
| `vscout/user/{userId}/data/{entity}` | ChangeEnvelope | 1 | no | **Private or user-scoped** records (section 9.5) |
| `vscout/user/{userId}/inbox` | `{ v:1, kind:'roleChanged'\|'forceLogout'\|'sessionRevoked', … }` | 1 | no | Account events, incl. `forceLogout { reason:'guest_access_disabled' \| 'guest_code_rotated' }` |
| `vscout/rpc/req/{userId}/{deviceId}` | RPC request (clients publish) | 1 | no | Section 9.10 |
| `vscout/rpc/res/{userId}/{deviceId}` | RPC response | 1 | no | One per request, section 9.10 |

**QoS 1:** `message`, `comment`, `scoutEntry`, `pitScouting`, `postScouting`, `allianceRank`, `match`,
`picklist`, `picklistEntry`, `eventSettings`, `allianceBoard`, `teamSettings`, `userSettings`.
**QoS 0:** `eventTeam`, `team`, `event`, `user`, `mediaAsset`, `reaction`.

### 9.5 Private data routing (security, MUST)

Event `data/` topics are readable by **every** role including guests. Event-channel chat and its
reactions go **only** to `vscout/event/{eventKey}/chat/{entity}`, which guests can't read.
Announcements and announcement reactions go to `data/`. Publish these **only** to user topics:

| Record | Publish to |
|---|---|
| Comment with `visibility: 'private'` | `vscout/user/{authorId}/data/comment` |
| DM message (`dm:{a}:{b}`) | `vscout/user/{a}/data/message` **and** `vscout/user/{b}/data/message` |
| Reaction on a DM message | `vscout/user/{a}/data/reaction` **and** `vscout/user/{b}/data/reaction` |
| `userSettings` | `vscout/user/{userId}/data/userSettings` |

When a record's audience changes, publish the new version to the new audience and `op:'delete'` to the old one.

### 9.6 Publishing rules (MUST)

1. **Commit → append to the change log → publish.** Publish the *same* envelope `/sync/changes` would return.
2. One envelope per message. No arrays.
3. Within one record, publish revisions in increasing order.
4. **Max 8 KB per data envelope.** Anything larger is published as a `control resync` for that entity instead.
5. **Bulk changes:** if one import or job changes **more than 50 records** of an event, don't publish them
   one by one. Publish one `control` `{ cmd:'resync', entities:[…] }`. Imports that change nothing publish nothing.
6. **Two publish queues (priority):**
   - **Urgent:** announcements, DMs, admin alerts, inbox, `sys/status`. Sent immediately.
   - **Bulk:** scouting, pit and post entries, team and eventTeam, match score refreshes. Rate-limited to ~20 messages/s per event.
   - The rest (chat, comments, match schedule, picklists, alliance board, settings) goes in the normal queue, not throttled.
   - With EMQX, also configure `mqueue_priorities` so urgent topics jump each client's queue.
7. If the broker is down, **writes still succeed.** Log the failed publish; clients catch up through the change log.
8. With several API instances, the instance that committed the write publishes it. Server-side subscribers (e.g. presence for
   a sync-health view) use shared subscriptions (`$share/api/…`).

### 9.7 Client-published payloads (FYI; broker treats them as opaque)

- **Presence** (retained, admins and scouters only; guests never publish presence):
  - Shape: `{ v:1, status:'online'|'away'|'offline', userId, deviceId, ts, appVersion }`. There's no
    `activity` field.
  - The Last Will publishes `offline` with `reason:'lwt'`.
  - Clients set `messageExpiryInterval` to 24 h.
- **Typing:** `{ v:1, channelId, userId, state:'typing', ts }`, event channel only.

### 9.8 Broker choice

| | EMQX 5 (recommended) | Mosquitto 2 + go-auth |
|---|---|---|
| JWT auth | built in (JWKS for RS256, recommended; or HMAC) | via HTTP hook to your API |
| Bind token to clientId | `verify_claims = { sub = "${username}", cid = "${clientid}" }` | prefix check in your hook |
| ACL | from the token's `acl` claim, no API dependency | HTTP hook per subscribe **and per delivery** (cache needed) |
| Disconnect on token expiry | yes | no |
| Works while the API is down | yes | **no**, every connect fails |
| Licence | 5.8.x Apache-2.0. 5.9+ BSL with free single-node use | EPL / MIT |

**Gotchas observed in testing:**
- If the broker authenticates via hooks on your API, connect your API's own MQTT client **after** the HTTP
  server is listening, otherwise startup deadlocks.
- Python `fastapi-mqtt`:
  - Set `reconnect_retries=-1` (the default stops after one failure).
  - Publish only from `async` code: publishing from a sync endpoint silently lost 3 of 4 messages.

### 9.9 MQTT done when…

1. A wrong `sub`, wrong clientId, expired token or garbage token gets CONNACK 134/135.
2. A guest subscribing to presence gets SUBACK 135, and a scouter publishing to a data topic gets PUBACK 135. Neither is disconnected.
3. Creating a message publishes one envelope with `rev:1` and `opId` = the request's key. Replaying the request publishes nothing new.
4. A private comment appears **only** on the author's user topic.
5. A client disconnected during 3 changes gets none of them over MQTT, but `/sync/changes` returns all 3.
6. `sys/status` is delivered retained and survives a broker restart.
7. Killing a client's socket publishes its retained `offline` Last Will.
8. A bulk import of more than 50 records publishes a single `control resync`.
9. (EMQX) A connected client is disconnected when its token expires.
10. A guest can't subscribe to `chat/#`, and its `data/#` subscription never carries chat messages or
    chat reactions.
11. RPC parity: every request (except the HTTP-only list) returns the same status and body over HTTP
    and over RPC (section 9.10).

### 9.10 Request/response over MQTT 5 (RPC): MUST when `capabilities.mqttRpc` is true

Every endpoint in this document is mirrored over MQTT 5 request/response **with the same method, path,
headers, status codes, problem+json errors and body**, except the **HTTP-only list**:

| HTTP-only | Why |
|---|---|
| `/auth/*` (login, guest login, refresh, logout) | The refresh token is an HttpOnly cookie |
| Media upload (`POST /events/{eventKey}/media`) and media downloads | Binary and large |
| `POST /push/subscriptions/rotate` | Called by the service worker, which has no MQTT connection |

The app chooses per request: small requests (writes, change-log deltas with cursors, alliance board
actions) go over RPC while the socket is healthy, because the socket is already open and authenticated
on cellular; bootstrap pages prefer HTTP (compression). If a request times out or the transport fails,
the app asks again over the other transport with the **same `Idempotency-Key`**.

**Request.** The client publishes to `vscout/rpc/req/{userId}/{deviceId}` at QoS 1, with MQTT 5
properties `responseTopic = vscout/rpc/res/{userId}/{deviceId}`, `correlationData = <UTF-8 bytes of id>`,
`contentType = application/json`, `messageExpiryInterval = <client timeout in s>`:

```jsonc
{ "v": 1, "id": "<uuidv7, one per attempt>", "method": "GET|POST|PUT|PATCH|DELETE",
  "path": "/events/2026casj/scout-entries",       // relative to /api/v1
  "query": { "scope": "event:2026casj" },          // optional; string or string[] values
  "headers": { "Authorization": "Bearer <accessToken>", "Idempotency-Key": "<opId>",
               "X-Client-Version": "2.3.1" },
  "body": { } }                                     // optional
```

**Response.** Publish to the request's `responseTopic`, QoS 1, not retained, with the same
`correlationData` and `messageExpiryInterval: 30`:

```jsonc
{ "v": 1, "id": "<request id>", "status": 201,
  "headers": { "Content-Type": "application/json", "Date": "…", "Retry-After": "1", "ETag": "…" },
  "body": { } }                                     // exactly the HTTP body; null for 204
```

Rules (MUST):
1. Subscribe with a **shared subscription** `$share/api/vscout/rpc/req/+/+`, so each request is handled
   once even with several API instances.
2. Authorize from `headers.Authorization` exactly like HTTP. Also require token `sub` = topic `{userId}`
   and token `cid` = `vscout-{userId}-{deviceId}`, else `status: 403`.
3. Run the **same handler** as the HTTP route. Recommended: an in-process adapter that turns the message
   into an internal HTTP request, so every endpoint is mirrored automatically and can't drift.
   Idempotency records, the version gate (`426`), rate limits (`429`), and authorization filtering are
   shared with HTTP. An `Idempotency-Key` first seen over HTTP and replayed over RPC (or the reverse)
   replays the stored response.
4. **Size:** requests ≤ 256 KB. Responses **≤ 1 MiB** (the client's MQTT maximum packet size; a broker
   silently drops larger packets). Over the limit → `status: 413`, `code: 'rpc_too_large'`, and the app
   retries over HTTP.
5. **Paging over RPC:** the app asks `/sync/changes` with `limit ≤ 200`. Stop adding changes once the page
   passes **512 KB** and return `hasMore: true` with the cursor of the last change included.
6. **No ordering** is promised between requests; handle them concurrently if you like. Never answer one
   `id` twice. Drop requests whose message expiry has passed.
7. The commit → change log → fan-out order (section 9.6) is unchanged for writes that arrive over RPC.

The app waits 4 s (alliance board), 8 s (writes, deltas) or 20 s (bootstrap pages) before retrying over
HTTP, so answer small requests well under a second.

---

## 10. Web Push (VAPID)

### 10.1 Keys

- One P-256 VAPID key pair per deployment, kept in your secret store.
- `subject` = `mailto:` a real address, or an https URL on a real domain. Apple rejects `localhost` with `403 BadJwtToken`.
- VAPID JWT `exp` ≤ 24 h, signed per push-service origin.
- **Rotating the keys invalidates every subscription**, so rotate only after a compromise.

### 10.2 Endpoints

| Endpoint | Auth | Behavior |
|---|---|---|
| `GET /push/vapid-public-key` | none | `{ publicKey }` (base64url). Cacheable for 1 h |
| `PUT /push/subscriptions/{deviceId}` `{ subscription: { endpoint, expirationTime, keys: { p256dh, auth } }, platform: { os, standalone, declarative, appVersion } }` | any role | Upsert by `deviceId`. `userId` comes from the token, never the body. `endpoint` is unique: if it exists under another device or user, **move** it. Update `lastSeenAt`. Idempotent (clients call it at launch and at least daily) |
| `DELETE /push/subscriptions/{deviceId}` | owner | `204` even if already gone |
| `POST /push/subscriptions/rotate` `{ oldEndpoint, oldAuth, subscription }` | **no token** (called by the service worker) | Find by `oldEndpoint`, require a **constant-time match** of `oldAuth`, replace the endpoint and keys. `204` or `404 unknown_subscription`. Rate-limit by IP |
| `POST /push/test` | any role | Test notification to the caller's devices. At most 5 per minute |
| `PUT /me/read-markers` `{ markers:[{ scope:'channel', id, lastReadAt } \| { scope:'announcements', eventKey, lastReadAt }] }` | any role | **Optional.** Needed only for the home-screen badge count. If you build it, advertise `capabilities.readMarkers: true`; the app turns its badge on only then. If not, omit `app_badge` from payloads |
| `POST /admin/push/send`, `GET /admin/push/stats` | admin | Optional diagnostics |

**SSRF guard (MUST):** accept a subscription `endpoint` only if it's `https:` on a known push service:
`*.push.apple.com`, `fcm.googleapis.com`, `android.googleapis.com`, `*.push.services.mozilla.com`,
`*.notify.windows.com`. Otherwise `422 invalid_endpoint`. Validate `p256dh` (65-byte point) and `auth` (16 bytes).

**Cleanup:**
- Logout deletes that device's row.
- A revoked or expired refresh family deletes its devices' rows.
- A disabled user loses all rows.
- Daily prune: `lastSeenAt` older than 30 days, or ≥ 5 consecutive failures and no success for 7 days. Apple delays "gone" responses, so dead rows pile up without this.
- Don't store the role on the subscription. Resolve audiences from current roles at send time.

Every endpoint here except `rotate` is also available over MQTT RPC (section 9.10).

### 10.3 What triggers a push

Pushes fire **after commit** and **once per dedupe key**: a replayed write (over HTTP or RPC) MUST NOT
notify twice. Preferences come from the user's `userSettings.notifications`; a missing key means its
default:

| Preference key | Default | Meaning |
|---|---|---|
| `eventChat` | `'all'` | `'all'` = every event-channel message, `'mentions'` = only @mentions and replies to the user, `'off'` = none |
| `mutedChannelIds` | `[]` | no `message` pushes for these channels |
| `directMessages` | `true` | DMs |
| `announcements` | `true` | announcements |
| `ourMatchQueue` / `watchedMatchQueue` | `true` / `false` | "match coming up" for our team / watched teams |
| `matchResults` | `true` | in-app only (the app's notification center); store it, no push uses it |
| `matchLeadMinutes` | `10` | lead time for "match coming up" (2–30) |

| Kind | When | Audience | TTL / Urgency / Topic |
|---|---|---|---|
| `message` | Every committed event-channel message and DM, filtered by the preferences above | Channel members − author − **guests** − muted − preference-filtered | 21600 / normal / channel id |
| `announcement` | Announcement created (not edited) | Everyone with event access, **guests included** | 86400 / normal / — |
| `urgent` | Admin message with `priority:'urgent'` | Admin-chosen: all (guests included), roles, users. Always on | 900 / high / — |
| `match` | "Match coming up" (rule below). Advertise `capabilities.matchPush` | Users whose team (`teamSettings.teamNumber`) or watched team plays. Not guests | 600 / high / `m`+matchKey |
| `system` | Test, diagnostics | self or specified. Always on | 86400 / low / — |

**"Match coming up" rule (MUST if you send `match`):**
- Run a scheduler about every 30 s while matches are running.
- Use only the **live FRC Nexus estimate** (`match.predictedTime`) and only if it was updated **less
  than 5 minutes ago**. With no fresh estimate, **send nothing**. Never fall back to the scheduled
  time: when an event runs late, scheduled times would fire pushes far too early.
- Notify when `predictedTime − now ≤ matchLeadMinutes` and the match isn't already on the field.
- Send **once per (user, match)**. Store the dedupe key; a later change of the estimate never sends a
  second push.

There's no `assignment` kind (assignments are optional). Reactions never push. Guests receive only
`announcement`, `urgent` and `system`.

### 10.4 Delivery

- Encryption `aes128gcm` (RFC 8291) only.
- About 50 parallel requests per push service.

| Push service response | Action |
|---|---|
| 201/202 | success; reset failure counters |
| 404/410 | **delete the subscription** |
| 413 | bug (payload over 3,000 bytes); alert |
| 400/403 | VAPID or key problem; alert; keep the row |
| 429 | honor `Retry-After`, max 3 tries within TTL |
| 5xx / network | exponential backoff, max 3, then count a failure |

### 10.5 Payload (the only accepted shape; ≤ 3,000 bytes before encryption)

Declarative Web Push format, **the same payload for every browser and iOS version**. Don't branch on
platform:
- iOS/iPadOS **18.4+** shows it as Declarative Web Push, even without the service worker running.
- iOS **16.4–18.3** delivers it as a classic push; the app's service worker reads the same
  `notification` object and shows it.
- Chrome and Firefox behave like iOS 16.4–18.3.
- Below iOS 16.4 there's no web push.

```jsonc
{
  "web_push": 8030,
  "mutable": true,
  "notification": {
    "title": "…",                 // ≤ 80 chars, required
    "body": "…",                  // ≤ 240 chars, plain text
    "navigate": "https://<PWA origin><data.url>",   // absolute, PWA origin (not the API's)
    "tag": "<kind>:<entityOrChannelId>",
    "lang": "en-US", "dir": "ltr",
    "icon": "https://<PWA origin>/icons/icon-192.png",
    "badge": "https://<PWA origin>/icons/badge-72.png",
    "silent": false,
    "requireInteraction": false,  // true only for 'urgent'
    "renotify": true,             // 'message': true for DMs, mentions and replies; false for plain chatter
    "timestamp": 0,               // ms epoch
    "app_badge": 3,               // integer; only with capabilities.readMarkers, otherwise omit
    "data": { "v": 1, "id": "<uuid>", "kind": "message", "url": "/messages/<channelId>",
              "uid": "<recipient userId>", "eventKey": "2026casj",
              "entity": { "type": "message", "id": "<id>" }, "ts": "…" }
  }
}
```

Deep links (`data.url`):

| Kind | URL |
|---|---|
| `message` | `/messages/{channelId}` |
| `announcement`, `urgent` | `/messages/announcements` |
| `match` | `/matches/{matchKey}`, or `/scout/strategy/{matchKey}` for our own match |
| `system` | `/settings/notifications` |

The old `/scout/messages/…` and `/scout/announcements` paths still redirect in the app (FX-14, 2026-10-03), so a server that hasn't switched yet keeps working.

**Never put record data in a push.** It's only an alert.
- Never send a push the app is expected to hide: iOS has no silent push and revokes subscriptions that try.
- Build titles and bodies from templates, cap their lengths, and strip control characters.

---

## 11. External data imports (TBA, Statbotics, FRC Nexus)

The app never calls these services. The backend imports their data and serves it through the change log.

| Source | Feeds | Suggested cadence during an event |
|---|---|---|
| The Blue Alliance API v3 | `event`, `team`, `match` (schedule, results, score breakdowns), `eventTeam` rankings | Matches every 60 s (or TBA webhooks); rankings every 2–5 min; teams once a day |
| Statbotics REST | EPA and other metrics on `eventTeam` | every 10 min |
| FRC Nexus API | queue status and estimated times on `match` (`predictedTime` plus `predictedTimeUpdatedAt`, the time Nexus last updated that estimate; the "match coming up" rule needs it), pit locations on `eventTeam` | every 30 s while matches run |

Rules:
- **MUST:** a re-import that doesn't change a record **doesn't change its `rev`**. Compare content hashes.
- **MUST:** more than 50 changed records in one import → one `control resync` on MQTT (section 9.6 rule 5).
- **MUST NOT** hard-code season fields. Store score breakdowns and Statbotics season metrics as JSON
  exactly as received, under `match.scoreBreakdown` / `eventTeam.stats`. The app's game module interprets them.
- **MUST NOT** silently map unknown values to defaults. Keep raw strings; the app maps them and flags unknowns.
- Respect each API's rate limits and keys. Cache with `ETag`/`If-Modified-Since` where supported.
- Import failures publish `admin/alerts` (`kind: 'importFailed'`) so admins see them.
- **Past events:** keep previous events' data available. Users can switch to a past event the server has.

---

## 12. Security and privacy

- HTTPS everywhere. HSTS on the API and the PWA host.
- Passwords hashed with a modern KDF (argon2id or bcrypt). Rate-limit login.
- The refresh cookie is `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`.
- **Private notes and DMs never leak**: filter them in `/sync/changes`, in message history, on MQTT and in push.
  Admins don't read others' private notes or DMs.
- **Guests never see chat or DMs** (change log, history, MQTT `chat/#` ACL, push). Guest access is off by
  default and per event; turning it off revokes guest sessions (section 3.4). While it's on, anyone with
  the app URL can read that event's scouting data: that's the accepted risk, so log guest logins.
- MQTT RPC requests are authorized from the token in the request, never from the topic alone (section 9.10).
- Validate every request body. Reject unknown game versions rather than storing them blindly.
- The push endpoint SSRF guard (section 10.2).
- Secrets (JWT signing key, VAPID private key, TBA/Nexus keys, DB credentials) live in a secret store
  or environment, **never in the repo**. v1 committed its secret key with `DEBUG=True`; don't repeat that.
- Log `requestId` on every request and return it in error bodies.

---

## 13. Operations

### 13.1 Hosting the PWA (static files)

- HTTPS on a real domain (required for service workers, push and iOS install).
- Cache headers:
  - `index.html`, `sw.js` and `manifest.webmanifest`: `Cache-Control: no-cache`.
  - Hashed files under `assets/`: `Cache-Control: public, max-age=31536000, immutable`.
- **When deploying, keep the previous build's `assets/*` for at least 7 days.** Phones still
  running the old version load old chunks lazily, and deleting them causes blank screens.
- Keep a "kill switch" ready: a minimal `sw.js` that unregisters itself, deployable in an emergency.
- SPA fallback: unknown paths serve `index.html`.

### 13.2 Running at events

- One small server (VPS) serves the API, broker, DB and object storage. Target ~100 concurrent devices.
- Keep time in sync (NTP). Clients use the `Date` header and `serverTime`.
- The broker and API are reached over the public internet; phones use cellular at venues. There's no
  local venue server (decided).
- Monitoring:
  - API error rate and latency
  - broker connections
  - import job health
  - push failure counts
  - change-log size
- Backups: daily DB backups; scouting data is irreplaceable.

### 13.3 Retention

| Data | Keep at least |
|---|---|
| Idempotency records | 7 days |
| Deleted records in the change log | 30 days (restore window) |
| Push delivery logs (optional) | 7 days |
| Scouting data, comments, picklists | indefinitely (past events stay browsable) |

---

## 14. Acceptance checklist (the backend is ready when…)

- [ ] Login → refresh (cookie) → `/me` works. A replayed old refresh token within 60 s returns the same new token.
- [ ] `/sync/changes` bootstrap of an event returns everything. A follow-up call with the cursor returns only newer changes. An expired cursor → 410.
- [ ] A write with a client UUID returns 201. Replaying the same request returns the identical response. A different body with the same key → 422.
- [ ] A `baseRev` mismatch → 409 with `current`. Delete then restore keeps the same id.
- [ ] A guest write → 403 `role_required`. A non-author edit → 403 `not_author`.
- [ ] Private comments and DMs are invisible to other users in `/sync/changes`, message history, MQTT and push.
- [ ] A re-import of unchanged TBA data changes no revs and publishes nothing.
- [ ] All MQTT checks in section 9.9 pass.
- [ ] RPC parity: the HTTP checks above, re-run through MQTT RPC, give identical status and bodies (section 9.10).
- [ ] Guest login works with the event's guest code and fails with `401 invalid_guest_code` otherwise;
      wrong codes are rate-limited; guests never receive chat, DMs or DM reactions; a guest can react to
      an announcement and nothing else; turning guest access off or changing the code signs guests out.
- [ ] `GET /meta` lists the `capabilities` you actually implement.
- [ ] "Match coming up" sends nothing without a Nexus estimate fresher than 5 minutes, and at most once per user and match.
- [ ] Push: SSRF guard, upsert/move by device, 410 deletes, replayed writes don't double-notify, the payload matches section 10.5.
- [ ] `426 upgrade_required` and the retained `sys/status` agree on `minClientVersion`.
- [ ] A deploy leaves the previous build's assets in place.

## 15. Open decisions for the backend author

1. EMQX or Mosquitto (on a VPS reachable from the internet).
2. JWT signing: RS256 + JWKS is recommended; a shared HMAC secret is acceptable.
3. Cursors per entity or one per scope (the app handles both).
4. Whether to build read markers (advertise `capabilities.readMarkers`).
5. Exact paths for the admin endpoints. The app's admin screens moved to Settings, but **these API
   paths don't change because of that**. Rename freely and tell the frontend lead.
6. Which optional `capabilities` to ship first (`mqttRpc` is strongly recommended).
