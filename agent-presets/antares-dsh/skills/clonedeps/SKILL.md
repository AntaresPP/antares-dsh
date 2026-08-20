---
name: clonedeps
description: Clone a small approved set of dependency source repositories into .dsh/antares-dsh/clonedeps/repos so agents can inspect library internals locally. Use when the user asks to clone dependencies or when implementation depends on undocumented internals.
---

# Clonedeps

Local source mirroring for important project dependencies. The goal is
inspection, not building the dependency.

## Layout

- Clones: `.dsh/antares-dsh/clonedeps/repos/<dep-name>/`
- Registry: `.dsh/antares-dsh/clonedeps.json`
- Ignore: `.dsh/antares-dsh/clonedeps/` must be git-ignored (check and add a
  managed marker block only if missing).
- `AGENTS.md`: add a `## Cloned Dependency Source` section listing each
  read-only clone path with a one-sentence purpose. Keep edits inside a
  clearly marked managed block.

## Selection rules

- Direct, important dependencies only.
- Maximum 3-5 clones by default.
- HTTPS repository URLs only.
- Pinned tags or commits only; never clone a moving branch for this purpose.
- Ask the user for approval before cloning anything.

## Workflow

1. Identify important dependencies. Use `librarian` when the official
   repository URL and a meaningful tag are not obvious.
2. Check `.dsh/antares-dsh/clonedeps.json`; reuse an existing clone when the
   requested tag/commit is already present.
3. After approval:
   ```bash
   git clone --depth 1 --branch <tag-or-commit> <https-url> .dsh/antares-dsh/clonedeps/repos/<dep-name>
   ```
   For a commit that is not a branch tip, clone then checkout the exact
   commit; record the full SHA in the registry.
4. Record `{ name, url, tagOrCommit, path, clonedAt, purpose }` in
   `.dsh/antares-dsh/clonedeps.json`.
5. Update the managed block in `AGENTS.md`.

## Safety defaults

- Cloned repositories are read-only reference material: never edit inside a
  clone.
- Never run a dependency's scripts, installers, or build steps.
- Never add a cloned path to git; verify it is ignored after cloning.
- Ignore-file edits are limited to the managed marker block.
