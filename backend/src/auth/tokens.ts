// Access tokens: RS256 JWTs with a JWKS endpoint so the broker verifies them without a shared
// secret (REQUIREMENTS §3.2). The key comes from JWT_PRIVATE_KEY or is generated once and kept in
// the database.
import { createPrivateKey, createPublicKey, generateKeyPairSync, type KeyObject } from "node:crypto"
import { SignJWT, exportJWK, jwtVerify, errors as joseErrors } from "jose"
import type { JWK } from "jose"
import type { Db } from "../db/db.js"
import type { Clock } from "../lib/clock.js"
import { sha256 } from "../lib/json.js"
import { problem } from "../lib/problem.js"
import type { AclRule } from "./acl.js"

export type TokenRole = "admin" | "scouter" | "guest" | "service"

export interface AccessClaims {
  sub: string
  role: TokenRole
  cid: string
  sid: string
  iat: number
  exp: number
  ek?: string
  acl?: AclRule[]
}

const ISSUER = "vscout"

export class TokenService {
  private privateKey: KeyObject
  private publicKey: KeyObject
  readonly kid: string

  constructor(
    db: Db,
    private clock: Clock,
    private accessTtlSec: number,
    pem?: string
  ) {
    let keyPem = pem?.replace(/\\n/g, "\n")
    if (!keyPem) {
      keyPem = db.getMeta("jwt_private_pem")
      if (!keyPem) {
        const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })
        keyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString()
        db.setMeta("jwt_private_pem", keyPem)
      }
    }
    this.privateKey = createPrivateKey(keyPem)
    this.publicKey = createPublicKey(this.privateKey)
    const der = this.publicKey.export({ type: "spki", format: "der" })
    this.kid = sha256(der).slice(0, 16)
  }

  async jwks(): Promise<{ keys: JWK[] }> {
    const jwk = await exportJWK(this.publicKey)
    return { keys: [{ ...jwk, kid: this.kid, alg: "RS256", use: "sig" }] }
  }

  async sign(claims: Omit<AccessClaims, "iat" | "exp">, ttlSec = this.accessTtlSec): Promise<{ token: string; expiresAt: number }> {
    const iat = Math.floor(this.clock.now() / 1000)
    const exp = iat + ttlSec
    const token = await new SignJWT({ ...claims })
      .setProtectedHeader({ alg: "RS256", kid: this.kid, typ: "JWT" })
      .setIssuer(ISSUER)
      .setIssuedAt(iat)
      .setExpirationTime(exp)
      .sign(this.privateKey)
    return { token, expiresAt: exp * 1000 }
  }

  /** Verifies signature and expiry; throws 401 token_expired / token_invalid. */
  async verify(token: string): Promise<AccessClaims> {
    try {
      const { payload } = await jwtVerify(token, this.publicKey, {
        issuer: ISSUER,
        algorithms: ["RS256"],
        currentDate: new Date(this.clock.now()),
      })
      if (typeof payload.sub !== "string" || typeof payload.role !== "string" || typeof payload.sid !== "string")
        throw problem(401, "token_invalid")
      return payload as unknown as AccessClaims
    } catch (e) {
      if (e instanceof joseErrors.JWTExpired) throw problem(401, "token_expired")
      if (e instanceof Error && "status" in e) throw e
      throw problem(401, "token_invalid")
    }
  }
}
