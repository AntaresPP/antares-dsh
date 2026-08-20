---
name: antares-dsh
description: Configure, customize, and safely improve this antares-dsh multi-agent setup: specialist models, tool permissions, skills, commands, and the preset composition. Use when the user asks to tune their setup.
---

# Antares DSH Setup Guide

This skill teaches agents how the antares-dsh plugin is assembled so they can
suggest safe configuration changes.

## What lives where

- Installed preset: `~/.dsh/.agent-presets/antares-dsh/agent.cordis.yml`
  (synced from the `antares-dsh` package on first install; never overwritten
  by updates).
- Bundled skills: `~/.dsh/.agent-presets/antares-dsh/skills/<name>/SKILL.md`
- Host plugin: registers `/deepwork`, `/reflect`, `/loop` and the
  `ast_grep_search` / `ast_grep_replace` tools.
- Runtime state: `.dsh/antares-dsh/` in the project (deepwork, loop history,
  worktrees, clonedeps, codemap state).

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
      allow: [read, glob, grep, ast_grep_search, skill, ask_user_question]
```

To change what a specialist may touch, edit its `toolFilter.allow` list. The
shell tool is platform-specific: use `pwsh` on Windows, `bash` elsewhere
(designer/fixer rows already compute this from `process.platform`).

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

## Safety rules

- Ask before changing `agent.cordis.yml`, skills, commands, or tool
  permissions unless the user explicitly requested that exact edit.
- Preset changes only affect sessions created or recomposed afterwards.
  Restart dsh or start a new session for changes to take effect.
- The installed preset under `~/.dsh/.agent-presets` is the user's copy;
  never overwrite it with package content without being asked.
- Prefer the smallest change that meets the stated goal. Keep fallbacks: do
  not delete a working model row while writing a new one.
