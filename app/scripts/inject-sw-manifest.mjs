// After `vite build` and the SW build: writes dist/client/version.json, injects the precache
// manifest into dist/client/sw.js, and enforces the precache budget (pwa-offline.md §1.3, §2).
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { injectManifest } from "workbox-build"

const pkg = JSON.parse(readFileSync("package.json", "utf8"))
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/
if (!SEMVER.test(pkg.version ?? ""))
  throw new Error(`package.json version is not semver: ${pkg.version}`)

function shortSha() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7)
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
  } catch {
    return "dev"
  }
}

// 1. version.json: never precached, served no-store
writeFileSync(
  "dist/client/version.json",
  JSON.stringify({
    version: pkg.version,
    commit: shortSha(),
    builtAt: new Date().toISOString(),
  }) + "\n"
)

// 2. precache manifest
const { count, size, warnings } = await injectManifest({
  swSrc: ".sw-build/sw.js",
  swDest: "dist/client/sw.js",
  globDirectory: "dist/client",
  globPatterns: [
    "index.html",
    "assets/**/*.{js,css}",
    "assets/**/*.{woff2,woff}",
    "assets/**/*.{webp,avif,png,jpg,svg}",
    "manifest.webmanifest",
    "favicon.ico",
    "icons/**/*.{png,svg}",
  ],
  globIgnores: ["sw.js", "version.json", "**/*.map", "robots.txt"],
  dontCacheBustURLsMatching: /^assets\//,
  maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
  // Unhashed files get the version in their revision, so every release refreshes them.
  manifestTransforms: [
    async (entries) => ({
      manifest: entries.map((e) =>
        e.revision ? { ...e, revision: `${e.revision}-${pkg.version}` } : e
      ),
      warnings: [],
    }),
  ],
})
// An optional pattern with no files yet (e.g. no images) is fine; anything else fails the build.
const fatal = warnings.filter((w) => !w.includes("doesn't match any files"))
if (fatal.length) {
  fatal.forEach((w) => console.error(w))
  process.exit(1)
}
if (size > 3 * 1024 * 1024) {
  console.error(`[sw] precache ${size} B is over the 3 MB budget`)
  process.exit(1)
}
// 3. the SW bytes must carry the version, so every release is a byte-different sw.js
if (!readFileSync("dist/client/sw.js", "utf8").includes(pkg.version)) {
  console.error(`[sw] dist/client/sw.js doesn't contain ${pkg.version}`)
  process.exit(1)
}
console.log(
  `[sw] v${pkg.version}: precached ${count} files, ${(size / 1024).toFixed(1)} KiB`
)
