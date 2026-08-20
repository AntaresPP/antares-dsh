# antares-dsh

`antares-dsh` is a DeepSeek Harness (dsh) plugin inspired by
[alvinunreal/oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim):
an orchestrator preset with specialist subagents, bundled workflow skills,
`/deepwork` `/reflect` `/loop` commands, and AST-aware
`ast_grep_search` / `ast_grep_replace` tools.

Implementation design: [`docs/implementation.md`](docs/implementation.md)
Self-check report: [`docs/self-check-report.md`](docs/self-check-report.md)

## Status

v0.1.0 full implementation complete; static self-check passed (24/24 tests).
Real dsh profile load remains a manual review step. See
[`docs/self-check-report.md`](docs/self-check-report.md).

## Features

- **Orchestrator preset**: Antares scheduler persona with routing, background
  scheduling, write ownership, and verification rules.
- **8 specialist tools** via official `dsh-tool-subagent` instances:
  `explorer`, `oracle`, `librarian`, `designer`, `fixer`, `council`,
  `councillor-alpha`, `councillor-beta`. Each has its own persona and
  hard `toolFilter` permission set.
- **8 skills**: codemap, deepwork, verification-planning, simplify, worktrees,
  clonedeps, reflect, antares-dsh (setup guide).
- **3 commands**: `/deepwork <task>`, `/reflect [focus] [--sessions] [--last N]`,
  `/loop <goal/success/max attempts>`.
- **2 tools**: `ast_grep_search`, `ast_grep_replace` (25 languages, dry-run
  by default).

## Install

Full publish/restore flow: [`docs/release.md`](docs/release.md)

```bash
# latest commit (simplest, not pinned)
dsh plugin --profile <profile> add github:<owner>/antares-dsh

# recommended: pin a release tag or full commit sha
dsh plugin --profile <profile> add github:<owner>/antares-dsh#v0.1.0
```

Restart dsh fully, create a new session, and select the **Antares DSH** agent
preset. The host plugin copies `agent-presets/antares-dsh/` into
`~/.dsh/.agent-presets/antares-dsh` on first boot only. Existing copies are
never overwritten; delete the installed preset directory and restart to
refresh it.

## Configure specialist models

Edit `~/.dsh/.agent-presets/antares-dsh/agent.cordis.yml` and add to any
`agent-*` row:

```yaml
    agentOptions:
      provider: <provider-id>
      model: <model-id>
```

Without `agentOptions`, a specialist inherits the main session model. Changes
apply to sessions created afterwards.

## ast-grep binary

`antares-dsh` resolves `sg` in this order: `AST_GREP_SG` env, cache dir,
`@ast-grep/cli` package (declared dependency), platform-specific package,
Homebrew. There is no automatic GitHub download. If it is missing:

```bash
npm install -D @ast-grep/cli
# or: cargo install ast-grep --locked
# or: brew install ast-grep
```

## Test

```bash
node --test
```
