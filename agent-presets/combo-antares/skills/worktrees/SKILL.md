---
name: worktrees
description: Manage git worktrees as safe, isolated coding lanes under .dsh/antares-dsh/worktrees for risky or parallel work. Use when the user asks to work in a worktree or when parallel lanes must not pollute the current branch.
---

# Worktrees

Git worktree lanes let several specialists work in parallel without stashing
or polluting the main branch. The orchestrator owns the lifecycle; delegated
specialists work inside one lane only.

## Layout

- Lanes: `.dsh/antares-dsh/worktrees/<slug>/`
- Registry: `.dsh/antares-dsh/worktrees.json`
- Branch default: `antares/<slug>` (respect a custom user pattern if one is
  already configured in the project).

## Pre-flight

Before creating anything:

```bash
git status --short
git worktree list
```

- Do not proceed if the repository is dirty in a way that would collide with
  the lane.
- Reuse an existing lane when `.dsh/antares-dsh/worktrees.json` already has
  the slug.

## Lifecycle

1. **Create** (after explicit user approval when this is a new lane):
   ```bash
   git worktree add -b antares/<slug> .dsh/antares-dsh/worktrees/<slug>
   ```
2. **Track**: add the slug, branch, base commit, and owner specialist to
   `.dsh/antares-dsh/worktrees.json`.
3. **Delegate**: give each specialist the absolute worktree path and tell it
   to operate only inside that path.
4. **Validate** in the lane with focused final-state evidence before any
   integration.
5. **Integrate**: merge/rebase/cherry-pick back only with user confirmation,
   after validation passes.
6. **Clean up**:
   ```bash
   git worktree remove .dsh/antares-dsh/worktrees/<slug>
   ```
   only after the lane's changes are integrated or explicitly abandoned, and
   only with user confirmation. Update the registry.

## Safety gates (strict confirmation required)

All of these are blocked until the user confirms:

- `git worktree add` / `git worktree remove`
- `git merge`, `git rebase`, `git cherry-pick`
- `git reset --hard`
- any branch deletion or force operation

When a lane is dirty, never remove it; surface the status and wait.

## Integration checklist

- Pre-flight `git status` clean in both the lane and the target branch.
- Focused final-state verification (see the verification-planning skill) ran
  inside the lane.
- User approved the integration command.
- After integration, the main branch verification ran again.
