// Build-time constants shared by vite.config.ts and vite.sw.config.ts (pwa-offline.md §2).
// app/package.json "version" is the only hand-edited version (ADR-068).
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..")

export function appVersion(): string {
  const pkg = JSON.parse(
    readFileSync(join(appDir, "package.json"), "utf8")
  ) as {
    version: string
  }
  return pkg.version
}

export function appCommit(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7)
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: appDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
  } catch {
    return "dev"
  }
}

/** Values for Vite `define`. Read them only through src/config/version.ts. */
export function buildDefines(): Record<string, string> {
  return {
    __APP_VERSION__: JSON.stringify(appVersion()),
    __APP_COMMIT__: JSON.stringify(appCommit()),
    __APP_BUILT_AT__: JSON.stringify(new Date().toISOString()),
  }
}
