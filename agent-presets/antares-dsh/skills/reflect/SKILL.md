---
name: reflect
description: Review recent work, find repeated workflow friction, and recommend the smallest useful reusable asset (skill, command, preset rule, playbook, or no change). Use for /reflect, "reflect on my workflows", or when asked to turn repeated work into reusable instructions.
---

# Reflect

Learn from repeated work and propose the smallest useful improvement. Reflect
is intentionally conservative: if no repeated workflow is strong enough,
recommend creating nothing instead of manufacturing new assets.

## When to use

- The user runs `/reflect` or `/reflect <focus>`.
- The user runs `/reflect --sessions` for session archaeology.
- The user asks to turn repeated manual work into reusable instructions.

## When NOT to use

One-off implementation tasks, speculative agent creation, or broad
self-improvement with no usage evidence.

## Evidence sources

1. **Current conversation**: repeated user corrections, repeated routing
   patterns, re-explained rules.
2. **Project artifacts**: `AGENTS.md`, `.dsh/`, `.dsh/antares-dsh/` state,
   project playbooks, notes.
3. **Installed assets**: skills available in the session catalog, this
   preset's `agent.cordis.yml`, slash commands, tool permissions.
4. **Sessions mode**: when the official `session_search` /
   `session_event_read` / `session_event_trace` / `session_trace` tools are
   visible, use them to find and inspect relevant prior sessions in this
   workspace. If they are not available, say so explicitly and fall back to
   the current conversation and project artifacts; never read raw session
   files or invent historical evidence.

## Analysis

For each candidate improvement, record:

- **Pattern**: what repeats, with concrete evidence (quote the session or
  note, not a vague impression).
- **Friction**: why the current workflow costs time or tokens.
- **Smallest asset**: a skill, a command, a preset rule, an agent tool
  permission change, a project playbook, or `skip`.
- **Confidence and impact**: high/medium/low, with scope
  (global / cross-repo / project-specific).

## Output

Return a compact report:

1. Findings with evidence.
2. Recommended changes, each with the exact smallest asset and why.
3. Skipped candidates and why.
4. Items needing more evidence.

## Rules

- Prefer evidence from repeated recent behavior over speculation.
- Ask before changing prompts, skills, commands, agents, tool access, or
  config unless the user explicitly requested that exact edit.
- Session search is workspace-scoped and read-only; never inspect sessions
  outside the current workspace and never modify session files.
