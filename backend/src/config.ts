// Runtime configuration, read once from the environment. Secrets (TBA/Nexus keys, JWT and VAPID
// keys) only ever come from here, never from the repo (REQUIREMENTS §12).
import { z } from "zod"

const bool = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((v) =>
      v === undefined || v === "" ? fallback : /^(1|true|yes|on)$/i.test(v)
    )

const json = <T extends z.ZodType>(schema: T, fallback: z.infer<T>) =>
  z
    .string()
    .optional()
    .transform((v, ctx): z.infer<T> => {
      if (!v) return fallback
      try {
        return schema.parse(JSON.parse(v)) as z.infer<T>
      } catch {
        ctx.addIssue({ code: "custom", message: "invalid JSON" })
        return z.NEVER
      }
    })

const list = z
  .string()
  .optional()
  .transform((v) =>
    (v ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  )

const envSchema = z.object({
  PORT: z.coerce.number().int().default(8080),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.string().default("info"),
  DATA_DIR: z.string().default("./data"),
  /** Public base of this API, e.g. https://api.example.org (media URLs are built from it) */
  PUBLIC_API_URL: z.string().url().default("http://localhost:8080"),
  /** PWA origin(s); the first one is used for push deep links */
  PWA_ORIGIN: list.transform((l) => (l.length ? l : ["http://localhost:3000"])),
  TRUST_PROXY: bool(true),
  COOKIE_SECURE: bool(true),

  MIN_CLIENT_VERSION: z.string().default("2.0.0-alpha.0"),
  ACTIVE_GAME_ID: z.string().default("2026-rebuilt"),
  GAME_SCHEMA_VERSIONS: json(z.record(z.string(), z.array(z.number().int())), {
    "2026-rebuilt": [1],
  }),
  /** FRC season year → the app's game id */
  GAME_IDS_BY_YEAR: json(z.record(z.string(), z.string()), {
    "2026": "2026-rebuilt",
  }),
  /** optional dir with <gameId>/schema.v<N>.json files published by the app */
  GAME_SCHEMAS_DIR: z.string().optional(),

  JWT_PRIVATE_KEY: z.string().optional(),
  ACCESS_TTL_SEC: z.coerce.number().int().min(60).default(900),
  REFRESH_TTL_DAYS: z.coerce.number().int().min(7).default(30),

  MQTT_URL: z.string().optional(),
  MQTT_INSTANCE_ID: z.string().default("1"),
  MQTT_SERVICE_USERNAME: z.string().default("vscout-api"),

  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default("mailto:admin@example.org"),

  TBA_API_KEY: z.string().optional(),
  NEXUS_API_KEY: z.string().optional(),
  STATBOTICS_ENABLED: bool(true),
  IMPORTS_ENABLED: bool(true),
  /** events to track on first start (comma list); admins add more with POST /admin/events */
  TRACKED_EVENTS: list,

  BOOTSTRAP_ADMIN_USERNAME: z.string().optional(),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().optional(),
})

export type Config = z.infer<typeof envSchema>

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env)
  if (!parsed.success) {
    const lines = parsed.error.issues.map(
      (i) => `  ${i.path.join(".")}: ${i.message}`
    )
    throw new Error(`Invalid configuration:\n${lines.join("\n")}`)
  }
  return parsed.data
}

/** A config for tests: in-memory friendly defaults, overridable. */
export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    ...loadConfig({
      DATA_DIR: ":memory:",
      PWA_ORIGIN: "https://app.test",
      PUBLIC_API_URL: "https://api.test",
      IMPORTS_ENABLED: "false",
      LOG_LEVEL: "silent",
    }),
    ...overrides,
  }
}
