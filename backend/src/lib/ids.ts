// UUIDv7 for server-created ids (guest users, audit rows, push notification ids).
import { randomBytes } from "node:crypto"

let lastMs = 0
let seq = 0

export function uuidv7(now: number = Date.now()): string {
  const bytes = randomBytes(16)
  if (now === lastMs) seq = (seq + 1) & 0xfff
  else {
    lastMs = now
    seq = bytes.readUInt16BE(6) & 0xfff
  }
  const ms = BigInt(now)
  for (let i = 0; i < 6; i++) bytes[i] = Number((ms >> BigInt(8 * (5 - i))) & 0xffn)
  bytes[6] = 0x70 | (seq >> 8)
  bytes[7] = seq & 0xff
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  const h = bytes.toString("hex")
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url")
}
