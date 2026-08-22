---
name: combo-antares
description: Configure, customize, and safely improve this combo-antares anchored orchestration setup: specialist models, tool permissions, skills, commands, and the preset composition. Use when the user asks to tune their setup.
---

# Combo Antares Setup Guide

This skill teaches agents how the combo-antares preset is assembled so they can
suggest safe configuration changes.

## What lives where

- Installed preset: `~/.dsh/.agent-presets/combo-antares/agent.cordis.yml`
  (synced from the `antares-dsh` package on first install; never overwritten
  by updates).
- Bundled skills: `~/.dsh/.agent-presets/combo-antares/skills/<name>/SKILL.md`
- Host plugin: registers `/deepwork`, `/reflect`, `/loop` and the
  `ast_grep_search` / `ast_grep_replace` tools.
- Runtime state: `.dsh/antares-dsh/` in the project (deepwork, loop history,
  worktrees, clonedeps, codemap state).

## How the fusion is put together

combo-antares is the fusion of two presets:

- **combo-anchored** contributes the anchoring mechanisms: `think-phase`
  (zero-tool think step per turn), `deliberation-gate` (shallow-turn first
  tool call denied below `minChars`), `cot-drip` (deliberation beat every Nth
  tool result), plus `instruction-hint`, `dev-tool-search`, `skill-search`
  (on-demand `skill_search` / `skill_load` instead of the 9KB skill catalog
  injection), and the anchored persona (`complete: true`,
  `includeRuntimeContext: false`).
- **antares-dsh** contributes the orchestrator team: 8 specialist subagent
  tools (`explorer`, `oracle`, `librarian`, `designer`, `fixer`, `council`,
  `councillor-alpha`, `councillor-beta`), the Antares scheduling rules
  (merged into the persona text), and the 8 bundled skills.

## How to configure specialists

Each specialist is one `dsh-tool-subagent` row in `agent.cordis.yml`, keyed by
`toolName` (`explorer`, `oracle`, `librarian`, `designer`, `fixer`, `council`,
`councillor-alpha`, `councillor-beta`).

To change a specialist's model:

```yaml
- id: agent-oracle
  name: '@deepseek-ai/dsh-tool-subagent'
  config:
    provider: spawn
    toolName: oracle
    backgroundMode: continuable
    agentOptions:
      provider: <provider-id>
      model: <model-id>
    persona: ...
    toolFilter:
      allow: [read, glob, grep, ast_grep_search, skill_load, ask_user_question]
```

To change what a specialist may touch, edit its `toolFilter.allow` list. The
shell tool is platform-specific: use `pwsh` on Windows, `bash` elsewhere
(designer/fixer rows already compute this from `process.platform`). Note that
`skill` is NOT available in this preset (the catalog injection is removed);
specialists load skills via `skill_load` instead (oracle uses `simplify`).

## Common requests

- "Use a cheaper model for explorer" -> add `agentOptions` to the
  `agent-explorer` row.
- "Make fixer safer" -> remove `write`/`edit` from `agent-fixer`'s allow list
  (it then becomes a read-only planner).
- "Give councillors different models" -> add different `agentOptions` to
  `agent-councillor-alpha` and `agent-councillor-beta`.
- "Add a specialist" -> copy any `agent-*` row, change its `id`/`toolName`,
  give it a unique name, and add its name to the council row's allow list if
  it should vote.
- "Tune the anchoring" -> edit `think-phase` (`mode`), `deliberation-gate`
  (`minChars`, `maxGatesPerTurn`), or `cot-drip` (`every`, `maxPerTurn`)
  config. `minChars: 0` or `every: 0` disables the corresponding mechanism.

## Safety rules

- Ask before changing `agent.cordis.yml`, skills, commands, or tool
  permissions unless the user explicitly requested that exact edit.
- Preset changes only affect sessions created or recomposed afterwards.
  Restart dsh or start a new session for changes to take effect.
- The installed preset under `~/.dsh/.agent-presets` is the user's copy;
  never overwrite it with package content without being asked.
- Prefer the smallest change that meets the stated goal. Keep fallbacks: do
  not delete a working model row while writing a new one.
