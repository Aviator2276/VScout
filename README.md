# VScout V2

New and improved for low latency and communication.

## Local-only files (not in git)

The planning docs, agent instructions, skills, and prototypes are **not tracked**.
They're shared as a zip. After cloning, unzip so these paths sit at the **repo root**
(next to `app/`):

| Path | Contents |
|---|---|
| `.plan/` | The full plan: start at `.plan/README.md` |
| `.claude/` | Agent skills (`.claude/skills/*`) and settings |
| `AGENTS.md` | Rules every agent/developer must follow |
| `CLAUDE.md` | Imports `AGENTS.md` for Claude Code |
| `temp/` | Throwaway prototypes (MQTT broker, push server, spikes) |

**To create the zip** (from the repo root; excludes dependencies):

```sh
zip -r vscout-local.zip .plan .claude AGENTS.md CLAUDE.md temp \
  -x '*/node_modules/*' '*/.venv/*' '*.DS_Store'
```

**To restore it** (from the repo root):

```sh
unzip vscout-local.zip -d .
```

Check: `ls -a` should show `.plan`, `.claude`, `AGENTS.md`, `CLAUDE.md`, and `temp`
alongside `app`. `git status` should stay clean because all five are gitignored.
