// Robot photos (REQUIREMENTS §8.1): multipart upload (HTTP only), a thumbnail, files served with
// range support and CORS. Match videos (§8.2) answer an empty list until a video source exists.
import { createHash } from "node:crypto"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { FastifyInstance } from "fastify"
import fastifyStatic from "@fastify/static"
import sharp from "sharp"
import type { Metadata } from "sharp"
import type { Ctx } from "../app.js"
import { iso } from "../lib/clock.js"
import { problem } from "../lib/problem.js"
import type { Rec } from "../domain/entities.js"

const MAX_BYTES = 10 * 1024 * 1024
const MIME_EXT: Record<string, string> = { jpeg: "jpg", webp: "webp" }

export async function mediaRoutes(api: FastifyInstance, ctx: Ctx) {
  const { s } = ctx
  const memory = s.config.DATA_DIR === ":memory:"
  const mediaDir = memory ? join(process.cwd(), ".test-media", String(process.pid)) : join(s.config.DATA_DIR, "media")
  mkdirSync(mediaDir, { recursive: true })
  const publicBase = `${s.config.PUBLIC_API_URL.replace(/\/+$/, "")}/api/v1/media-files`

  await api.register(fastifyStatic, {
    root: mediaDir,
    prefix: "/media-files/",
    decorateReply: false,
    acceptRanges: true,
    etag: true,
    maxAge: 365 * 86_400_000,
    immutable: true,
    index: false,
    list: false,
  })

  api.post<{ Params: { ek: string } }>("/events/:ek/media", async (req, reply) => {
    const p = await ctx.auth(req)
    if (p.role === "guest") throw problem(403, "role_required")
    if (!req.isMultipart()) throw problem(415, "validation_failed", { detail: "multipart/form-data expected" })
    const fields: Record<string, string> = {}
    let file: Buffer | null = null
    for await (const part of req.parts()) {
      if (part.type === "file") {
        if (part.fieldname !== "file" || file) {
          await part.toBuffer()
          continue
        }
        file = await part.toBuffer()
        if (part.file.truncated) throw problem(413, "payload_too_large", { detail: "Photos are limited to 10 MB" })
      } else fields[part.fieldname] = String(part.value)
    }
    if (!file) throw problem(422, "validation_failed", { errors: [{ path: "file", code: "required" }] })
    if (file.length > MAX_BYTES) throw problem(413, "payload_too_large")
    const sha = createHash("sha256").update(file).digest("hex")
    const ek = req.params.ek
    // the request hash covers the fields and the file's digest
    req.body = { ...fields, fileSha256: sha, bytes: file.length }
    const photo = file

    return ctx.idem(req, reply, p, async () => {
      const id = fields.id ?? ""
      const teamNumber = Number(fields.teamNumber)
      const kind = fields.kind ?? "robotPhoto"
      const errors = []
      if (!/^[A-Za-z0-9-]{1,64}$/.test(id)) errors.push({ path: "id", code: "invalid" })
      if (!Number.isInteger(teamNumber) || teamNumber <= 0 || teamNumber > 99999) errors.push({ path: "teamNumber", code: "invalid" })
      if (kind !== "robotPhoto") errors.push({ path: "kind", code: "invalid_enum" })
      if (errors.length) throw problem(422, "validation_failed", { errors })
      if (!s.store.live("event", ek)) throw problem(404, "not_found", { current: null })
      const existing = s.store.get("mediaAsset", id)
      if (existing?.deleted) throw problem(409, "deleted", { current: null })
      if (existing) throw problem(409, "already_exists", { current: existing.data })

      let meta: Metadata
      try {
        meta = await sharp(photo).metadata()
      } catch {
        throw problem(422, "validation_failed", { errors: [{ path: "file", code: "invalid_image" }] })
      }
      const ext = meta.format ? MIME_EXT[meta.format] : undefined
      if (!ext) throw problem(422, "validation_failed", { errors: [{ path: "file", code: "invalid_type", message: "image/jpeg or image/webp" }] })
      const thumb = await sharp(photo).rotate().resize({ width: 400, height: 400, fit: "inside", withoutEnlargement: true }).webp({ quality: 75 }).toBuffer()
      writeFileSync(join(mediaDir, `${id}.${ext}`), photo)
      writeFileSync(join(mediaDir, `${id}_thumb.webp`), thumb)
      const now = iso(s.clock.now())
      const rotated = (meta.orientation ?? 1) >= 5
      const rec: Rec = {
        id,
        rev: 1,
        eventKey: ek,
        authorId: p.id,
        createdAt: now,
        updatedAt: now,
        teamNumber,
        kind: "robotPhoto",
        url: `${publicBase}/${id}.${ext}`,
        thumbUrl: `${publicBase}/${id}_thumb.webp`,
        mime: `image/${meta.format}`,
        bytes: photo.length,
        ...(meta.width && meta.height ? { width: rotated ? meta.height : meta.width, height: rotated ? meta.width : meta.height } : {}),
      }
      s.store.tx(() => {
        if (s.store.get("mediaAsset", id)) throw problem(409, "already_exists", { current: s.store.get("mediaAsset", id)?.data ?? null })
        s.store.put("mediaAsset", rec, { actorId: p.id, opId: req.headers["idempotency-key"] as string })
      })
      return { status: 201, body: rec }
    })
  })

  api.get<{ Params: { ek: string; mk: string } }>("/events/:ek/matches/:mk/videos", async (req) => {
    await ctx.auth(req)
    return { items: [] }
  })

  api.get<{ Params: { ek: string } }>("/events/:ek/videos", async (req) => {
    await ctx.auth(req)
    return { items: [] }
  })
}
