# antares-dsh

`antares-dsh` is a DeepSeek Harness (dsh) plugin inspired by
[alvinunreal/oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim):
an orchestrator preset with specialist subagents, bundled workflow skills,
`/deepwork` `/reflect` `/loop` commands, and AST-aware
`ast_grep_search` / `ast_grep_replace` tools.

It ships **two agent presets**:

| Preset | 用途 |
|---|---|
| **Antares DSH** | 纯编排：orchestrator + 8 specialist subagents + 8 skills + 官方配套（tool-goal / tool-workflow / tool-ralph） |
| **Combo Antares** | 锚定编排：combo-anchored 锚定机制（think/execute 分离 + 审议门 + 审议滴灌，防 DeepSeek 过拟合）+ Antares 编排团队 |

Implementation design: [`docs/implementation.md`](docs/implementation.md)
Self-check report: [`docs/self-check-report.md`](docs/self-check-report.md)
Review report: [`docs/REVIEW.md`](docs/REVIEW.md)

## Status

v0.1.0 full implementation complete; static self-check passed (24/24 tests).
Real dsh profile load remains a manual review step. See
[`docs/self-check-report.md`](docs/self-check-report.md).

## Features

- **Orchestrator preset**: Antares scheduler persona with routing, background
  scheduling, write ownership, and verification rules.
- **Combo Antares preset**: the anchoring combination package (think-phase,
  deliberation-gate, cot-drip) fused with the Antares orchestrator team —
  anchored deliberation with specialist delegation.
- **8 specialist tools** via official `dsh-tool-subagent` instances:
  `explorer`, `oracle`, `librarian`, `designer`, `fixer`, `council`,
  `councillor-alpha`, `councillor-beta`. Each has its own persona and
  hard `toolFilter` permission set.
- **8 skills**: codemap, deepwork, verification-planning, simplify, worktrees,
  clonedeps, reflect, antares-dsh (combo-antares preset ships a
  combo-antares setup guide instead).
- **3 commands**: `/deepwork <task>`, `/reflect [focus] [--sessions] [--last N]`,
  `/loop <goal/success/max attempts>`.
- **2 tools**: `ast_grep_search`, `ast_grep_replace` (25 languages, dry-run
  by default).
- **Official companions enabled by default**: `tool-goal`, `tool-workflow`,
  `tool-ralph` (packages ship with `@deepseek-ai/dsh-base`; preset rows only).
- **User-level skills**: the 7 generic skills (deepwork, reflect, codemap,
  clonedeps, simplify, verification-planning, worktrees) are copied to
  `~/.dsh/skills/` on first install, so they are available in **every**
  preset, not just antares ones.

## Install

Full publish/restore flow: [`docs/release.md`](docs/release.md)

```bash
# latest commit (simplest, not pinned)
dsh plugin --profile <profile> add github:<owner>/antares-dsh

# recommended: pin a release tag or full commit sha
dsh plugin --profile <profile> add github:<owner>/antares-dsh#v0.1.0
```

Restart dsh fully, create a new session, and select the **Antares DSH** or
**Combo Antares** agent preset. The host plugin copies
`agent-presets/<name>/` into `~/.dsh/.agent-presets/<name>` and
`user-skills/` into `~/.dsh/skills/` on first boot only. Existing copies are
never overwritten; delete the installed directories and restart to refresh
them.

### Install companion plugins in one command

The `dsh plugin` CLI is a thin pnpm forwarder that accepts multiple packages,
and any dependency declaring `dsh.bundle` is auto-activated into the profile
layer stack. To install antares-dsh together with ecosystem companions in a
single command:

```bash
dsh plugin --profile <profile> add \
  github:<owner>/antares-dsh#v0.1.0 \
  github:<ecosystem-owner>/<companion-plugin>#<tag> \
  github:<ecosystem-owner>/<another-plugin>#<tag>
```

Or declare companions in this package's `dependencies`/`optionalDependencies`
(they must declare their own `dsh.bundle`) — `dsh plugin add github:<owner>/antares-dsh`
then installs and activates the full set in one shot. Note that forcing
third-party companions as hard dependencies installs them for every consumer;
the README command line above keeps the choice explicit.

## Configure specialist models

Edit `~/.dsh/.agent-presets/antares-dsh/agent.cordis.yml` (or
`combo-antares/agent.cordis.yml`) and add to any `agent-*` row:

```yaml
    agentOptions:
      provider: <provider-id>
      model: <model-id>
```

Without `agentOptions`, a specialist inherits the main session model. Changes
apply to sessions created afterwards.

In the **Combo Antares** preset, the anchoring knobs live in the same file:
`think-phase` (`mode`), `deliberation-gate` (`minChars`, `maxGatesPerTurn`),
`cot-drip` (`every`, `maxPerTurn`). `minChars: 0` / `every: 0` disables the
corresponding mechanism.

## User-level skills

The 7 generic skills are installed to `~/.dsh/skills/` (the harness user-dsh
skill root) on first plugin boot, so they show up in **any** preset that
keeps `includeDefaultRoots` on (the default). Skills there are never
overwritten by the plugin. You can also drop your own
`~/.dsh/skills/<name>/SKILL.md` for a personal, cross-preset skill.

Note: presets using `skill_search`/`skill_load` (Combo Antares) discover
these skills on demand; presets using `dsh-tool-skill` (Antares DSH) list
them in the catalog.

## ast-grep binary

`antares-dsh` resolves `sg` in this order: `AST_GREP_SG` env, cache dir,
`@ast-grep/cli` package (declared dependency), platform-specific package
(declared as optionalDependencies, so resolution works under any pnpm
linker layout), Homebrew. There is no automatic GitHub download. If it is
missing:

```bash
npm install -D @ast-grep/cli
# or: cargo install ast-grep --locked
# or: brew install ast-grep
```

## Test

```bash
node --test
```
