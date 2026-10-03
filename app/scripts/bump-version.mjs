#!/usr/bin/env node
// Release-version tool for the VScout PWA (ADR-068, .plan/guidelines/release-versioning.md).
// No dependencies. Every PR into main must raise app/package.json "version" above main's.
//
//   node scripts/bump-version.mjs --check                 exit 1 if version <= base (origin/main)
//   node scripts/bump-version.mjs --bump [type]           write the next version into package.json
//   node scripts/bump-version.mjs --next [type]           print the next version, change nothing
//
// type: auto (default) | prerelease | patch | minor | major | release
//   auto follows app/release.config.json "channel" (alpha | beta | rc | stable, PV-6):
//   a prerelease channel bumps the prerelease (switching channel resets to .0); stable releases a
//   prerelease base, otherwise picks major/minor/patch from conventional commits.
// Options:
//   --base <ref>     git ref holding the base version (default: origin/main)
//   --ref <rev>      check the version committed at <rev> instead of the working tree
//   --preid <id>     prerelease channel for "prerelease" (alpha | beta | rc); switching resets to .0
//   --fetch          run `git fetch origin main` first (failure is a warning, not an error)
//   --commit         after --bump, commit package.json as "chore(release): v<version>"
//   --force          with --bump, write even if the branch is already ahead of base
//   --quiet          only print errors

import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/
const TYPES = ["auto", "prerelease", "patch", "minor", "major", "release"]
const ZERO = "0.0.0"

// ---------- semver (subset of node-semver: parse, compare, inc) ----------

export function parse(v) {
  const m = SEMVER.exec(String(v ?? "").trim())
  if (!m) return null
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    pre: m[4] ? m[4].split(".") : [],
  }
}

export function format(s) {
  const core = `${s.major}.${s.minor}.${s.patch}`
  return s.pre.length ? `${core}-${s.pre.join(".")}` : core
}

function cmpId(a, b) {
  const an = /^\d+$/.test(a)
  const bn = /^\d+$/.test(b)
  if (an && bn) return Math.sign(Number(a) - Number(b))
  if (an) return -1 // numeric identifiers sort before alphanumeric ones
  if (bn) return 1
  return a < b ? -1 : a > b ? 1 : 0
}

/** semver precedence: -1, 0, 1. Build metadata is ignored. */
export function compare(a, b) {
  const x = typeof a === "string" ? parse(a) : a
  const y = typeof b === "string" ? parse(b) : b
  if (!x || !y) throw new Error(`Not semver: ${!x ? a : b}`)
  for (const k of ["major", "minor", "patch"]) {
    if (x[k] !== y[k]) return Math.sign(x[k] - y[k])
  }
  if (!x.pre.length && !y.pre.length) return 0
  if (!x.pre.length) return 1 // 2.0.0 > 2.0.0-alpha.0
  if (!y.pre.length) return -1
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    if (x.pre[i] === undefined) return -1
    if (y.pre[i] === undefined) return 1
    const c = cmpId(x.pre[i], y.pre[i])
    if (c) return c
  }
  return 0
}

/** node-semver `inc` semantics, so results match `npm version`. */
export function inc(version, type, preid) {
  const s = parse(version)
  if (!s) throw new Error(`Not semver: ${version}`)
  const hasPre = s.pre.length > 0
  switch (type) {
    case "major":
      if (!(hasPre && s.minor === 0 && s.patch === 0)) s.major++
      s.minor = 0
      s.patch = 0
      s.pre = []
      break
    case "minor":
      if (!(hasPre && s.patch === 0)) s.minor++
      s.patch = 0
      s.pre = []
      break
    case "patch":
      if (!hasPre) s.patch++
      s.pre = []
      break
    case "release":
      if (!hasPre) throw new Error(`${version} is not a prerelease`)
      s.pre = []
      break
    case "prerelease": {
      const id =
        preid || (hasPre && !/^\d+$/.test(s.pre[0]) ? s.pre[0] : "alpha")
      if (!hasPre) {
        s.patch++
        s.pre = [id, "0"]
      } else if (s.pre[0] !== id) {
        s.pre = [id, "0"] // channel switch: alpha.7 -> beta.0
      } else {
        const last = s.pre.length - 1
        if (/^\d+$/.test(s.pre[last]))
          s.pre[last] = String(Number(s.pre[last]) + 1)
        else s.pre.push("0")
      }
      break
    }
    default:
      throw new Error(`Unknown bump type: ${type}`)
  }
  return format(s)
}

const CHANNELS = ["alpha", "beta", "rc", "stable"]

/** Reads app/release.config.json; a missing file means "follow the base's channel". */
export function readChannel(path) {
  let raw
  try {
    raw = readFileSync(path, "utf8")
  } catch {
    return null
  }
  const channel = JSON.parse(raw).channel
  if (!CHANNELS.includes(channel))
    throw new Error(`${path}: "channel" must be one of ${CHANNELS.join(", ")}`)
  return channel
}

/** Picks the bump type (and prerelease id) for `auto` from the channel and the branch's commits. */
export function autoPlan(baseVersion, commitText, channel) {
  const basePre = parse(baseVersion)?.pre.length > 0
  if (channel && channel !== "stable")
    return { type: "prerelease", preid: channel }
  if (channel === "stable" && basePre) return { type: "release" }
  return { type: autoType(baseVersion, commitText) }
}

/** Picks the bump type from conventional-commit subjects/bodies on the branch. */
export function autoType(baseVersion, commitText) {
  if (parse(baseVersion)?.pre.length) return "prerelease" // stay on the channel until a release PR
  if (
    /^[a-z]+(\([^)]*\))?!:/m.test(commitText) ||
    /^BREAKING[ -]CHANGE:/m.test(commitText)
  )
    return "major"
  if (/^feat(\([^)]*\))?:/m.test(commitText)) return "minor"
  return "patch"
}

// ---------- git and file helpers ----------

const here = dirname(fileURLToPath(import.meta.url))
const appDir = join(here, "..")
const pkgPath = join(appDir, "package.json")
const channelPath = join(appDir, "release.config.json")

// Git exports GIT_DIR (and friends) to hooks. With GIT_DIR set, `rev-parse --show-toplevel`
// returns the cwd (app/) instead of the repo root, so drop them and let git discover the repo.
const gitEnv = Object.fromEntries(
  Object.entries(process.env).filter(
    ([k]) => !["GIT_DIR", "GIT_WORK_TREE", "GIT_PREFIX"].includes(k)
  )
)

function git(args, opts = {}) {
  return execFileSync("git", args, {
    cwd: appDir,
    env: gitEnv,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...opts,
  })
}

function gitRoot() {
  return git(["rev-parse", "--show-toplevel"]).trim()
}

/** package.json path relative to the git root, e.g. "app/package.json". */
function pkgGitPath() {
  return relative(gitRoot(), pkgPath).split("\\").join("/")
}

function refExists(ref) {
  try {
    git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`])
    return true
  } catch {
    return false
  }
}

/** Version at <ref>; null only when the ref exists but has no package.json yet. */
function versionAt(ref) {
  // A missing ref must never read as 0.0.0, or --check would pass by accident.
  if (!refExists(ref))
    throw new Error(
      `git ref "${ref}" not found. Run \`git fetch origin main\` or pass --base <ref>.`
    )
  let text
  try {
    text = git(["show", `${ref}:${pkgGitPath()}`])
  } catch {
    return null // the ref exists but has no package.json at this path
  }
  return readVersionFromText(text, `${ref}:${pkgGitPath()}`)
}

function readVersionFromText(text, where) {
  const v = JSON.parse(text).version
  if (v === undefined || v === "") return ZERO
  if (!parse(v))
    throw new Error(`${where}: "version" is not valid semver: ${v}`)
  return v
}

/** Rewrites only the "version" line so the file's formatting is untouched. */
export function setVersionInText(text, version) {
  const line = /^(\s*)"version"\s*:\s*"[^"]*"(,?)$/m
  if (line.test(text)) return text.replace(line, `$1"version": "${version}"$2`)
  // No version yet: insert it after "name" (or as the first key).
  const name = /^(\s*)"name"\s*:\s*"[^"]*",$/m
  if (name.test(text))
    return text.replace(
      name,
      (m, indent) => `${m}\n${indent}"version": "${version}",`
    )
  return text.replace(
    /^\{\n(\s*)/,
    (m, indent) => `{\n${indent}"version": "${version}",\n${indent}`
  )
}

// ---------- CLI ----------

function parseArgs(argv) {
  const o = {
    mode: null,
    type: "auto",
    base: "origin/main",
    ref: null,
    preid: null,
    fetch: false,
    commit: false,
    force: false,
    quiet: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const val = () => {
      const v = argv[++i]
      if (!v || v.startsWith("--")) throw new Error(`${a} needs a value`)
      return v
    }
    if (a === "--check") o.mode = "check"
    else if (a === "--bump" || a === "--next") {
      o.mode = a.slice(2)
      if (argv[i + 1] && !argv[i + 1].startsWith("--")) o.type = argv[++i]
    } else if (a === "--base") o.base = val()
    else if (a === "--ref") o.ref = val()
    else if (a === "--preid") o.preid = val()
    else if (a === "--fetch") o.fetch = true
    else if (a === "--commit") o.commit = true
    else if (a === "--force") o.force = true
    else if (a === "--quiet") o.quiet = true
    else if (a === "-h" || a === "--help") o.mode = "help"
    else if (TYPES.includes(a) && (o.mode === "bump" || o.mode === "next"))
      o.type = a
    else throw new Error(`Unknown argument: ${a}`)
  }
  if (!TYPES.includes(o.type))
    throw new Error(`Bump type must be one of ${TYPES.join(", ")}`)
  if (o.preid && !/^[a-z]+$/.test(o.preid))
    throw new Error("--preid must be lowercase letters (alpha, beta, rc)")
  return o
}

function main() {
  const o = parseArgs(process.argv.slice(2))
  const log = (...m) => o.quiet || console.log(...m)
  if (!o.mode || o.mode === "help") {
    console.log(
      readFileSync(fileURLToPath(import.meta.url), "utf8")
        .split("\n")
        .slice(1, 20)
        .map((l) => l.replace(/^\/\/ ?/, ""))
        .join("\n")
    )
    return o.mode === "help" ? 0 : 2
  }

  if (o.fetch) {
    try {
      git(["fetch", "--quiet", "--no-tags", "origin", "main"], {
        timeout: 20000,
      })
    } catch {
      console.warn(
        `[version] warning: could not fetch origin/main (offline?). Using the cached ${o.base}.`
      )
    }
  }

  const baseRaw = versionAt(o.base)
  if (baseRaw === null)
    console.warn(
      `[version] warning: ${o.base}:${pkgGitPath()} not found. Treating the base as ${ZERO}.`
    )
  const base = baseRaw ?? ZERO
  const current = o.ref
    ? (versionAt(o.ref) ?? ZERO)
    : readVersionFromText(readFileSync(pkgPath, "utf8"), pkgPath)

  let type = o.type
  let preid = o.preid ?? undefined
  if (type === "auto") {
    let commits = ""
    try {
      commits = git(["log", "--format=%s%n%b", `${o.base}..${o.ref ?? "HEAD"}`])
    } catch {
      /* no shared history: fall back to patch/prerelease */
    }
    const plan = autoPlan(base, commits, readChannel(channelPath))
    type = plan.type
    preid = preid ?? plan.preid
  }
  const next = inc(base, type, preid)
  const ahead = compare(current, base) > 0

  if (o.mode === "next") {
    console.log(next)
    return 0
  }

  if (o.mode === "check") {
    if (ahead) {
      log(`[version] ok: ${current} > ${base} (${o.base})`)
      return 0
    }
    const msg = `app/package.json version ${current} must be greater than ${o.base} (${base}). The PR from dev into main bumps the version; PRs into dev don't.`
    if (process.env.GITHUB_ACTIONS)
      console.log(
        `::error file=${pkgGitPath()},title=Version not bumped::${msg} Suggested: ${next}`
      )
    console.error(`[version] ${msg}`)
    console.error(`[version] suggested next version: ${next} (${type})`)
    console.error(
      `[version] fix:  pnpm --dir app run version:bump${o.type === "auto" ? "" : ` ${type}`}   then commit app/package.json`
    )
    console.error(
      `[version]   or: node app/scripts/bump-version.mjs --bump ${type} --commit`
    )
    return 1
  }

  // --bump
  if (ahead && !o.force) {
    log(
      `[version] already bumped: ${current} > ${base}. Nothing to do (use --force to recompute).`
    )
    return 0
  }
  const text = readFileSync(pkgPath, "utf8")
  writeFileSync(pkgPath, setVersionInText(text, next))
  log(`[version] ${current} -> ${next} (${type}, base ${o.base} = ${base})`)
  if (o.commit) {
    git(["add", "--", pkgPath])
    git(["commit", "--only", "-m", `chore(release): v${next}`, "--", pkgPath], {
      stdio: "inherit",
    })
    log(`[version] committed chore(release): v${next}`)
  } else {
    log(
      `[version] next: git add app/package.json && git commit -m "chore(release): v${next}"`
    )
  }
  return 0
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    process.exit(main())
  } catch (e) {
    console.error(`[version] error: ${e instanceof Error ? e.message : e}`)
    process.exit(2)
  }
}
