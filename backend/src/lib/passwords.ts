// Password hashing with scrypt (memory-hard KDF from node:crypto) and generated passphrases
// (three words + two digits, about 40 bits, REQUIREMENTS §3.1).
import { randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto"
import { WORDS } from "./wordlist.js"

const N = 1 << 15
const r = 8
const p = 1
const KEYLEN = 32
const MAXMEM = 64 * 1024 * 1024

function derive(password: string, salt: Buffer, n: number, rr: number, pp: number) {
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(password.normalize("NFKC"), salt, KEYLEN, { N: n, r: rr, p: pp, maxmem: MAXMEM }, (err, key) =>
      err ? reject(err) : resolve(key)
    )
  )
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await derive(password, salt, N, r, p)
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64url")}$${key.toString("base64url")}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$")
  if (parts.length !== 6 || parts[0] !== "scrypt") return false
  const [, n, rr, pp, salt, hash] = parts as [string, string, string, string, string, string]
  const expected = Buffer.from(hash, "base64url")
  const key = await derive(password, Buffer.from(salt, "base64url"), Number(n), Number(rr), Number(pp))
  return key.length === expected.length && timingSafeEqual(key, expected)
}

/** A dummy verify so unknown usernames take as long as known ones. */
let dummyHash: Promise<string> | null = null
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword("not-a-real-password")
  await verifyPassword(password, await dummyHash)
}

export function generatePassphrase(): string {
  const w = () => WORDS[randomInt(WORDS.length)]
  return `${w()} ${w()} ${w()} ${String(randomInt(100)).padStart(2, "0")}`
}
