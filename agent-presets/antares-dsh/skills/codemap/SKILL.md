---
name: codemap
description: Generate and maintain hierarchical codemap.md repository maps so agents understand a codebase without re-reading everything. Use when the user says "run codemap", asks for a repository map, or when the repo is unfamiliar.
---

# Codemap

Build and maintain a hierarchical, timeless map of the repository: one
`codemap.md` per directory, explaining *why* and *how* the code fits together,
not line-level implementation details.

## When to use

- Onboarding into an unfamiliar repository.
- The orchestrator needs a shared architectural map before dispatching
  explorers/fixers.
- A directory changed materially and its map is stale.

## Workflow

### 1. Initialize or update

Check whether `.dsh/antares-dsh/codemap.json` exists:

- Missing: treat this as initialization. Generate maps for the whole
  repository, top-down, starting at the root.
- Present: treat this as an update. Find changed directories with:

```bash
git status --short
git diff --name-only HEAD
```

Only regenerate maps for directories that actually changed, plus any parent
map whose child summaries changed.

After each generation round, update `.dsh/antares-dsh/codemap.json`:

```json
{
  "updatedAt": "<ISO timestamp>",
  "dirs": {
    "src/auth": { "marker": "<short description of what was mapped>" }
  }
}
```

The marker is a human-maintained content note, not a hash. Keep it short and
update it whenever that directory's map changes.

### 2. What every codemap.md contains

For each directory:

```markdown
# <directory> Codemap

## Purpose
One to three sentences: what this directory owns and why it exists.

## Layout
- `file-or-dir/` — one-line purpose
- `other.ts` — one-line purpose

## Key Flows
Step-by-step description of the main data/control flows through this
directory. Reference files with paths.

## Interfaces & Contracts
Public exports, APIs, schemas, or invariants other directories rely on.

## Gotchas
Non-obvious constraints, ordering requirements, or historical decisions.
```

- Focus on high-level design and relationships, not implementation trivia.
- Reference file paths rather than pasting code.
- Mark unknown areas explicitly as "not yet mapped" instead of guessing.

### 3. Tool use

- Use `read` sparingly for entry points and exports.
- Use `glob` / `grep` to discover files, symbols, and imports.
- Use `ast_grep_search` for structural patterns.
- Never edit source files while mapping. Only the map files and
  `.dsh/antares-dsh/codemap.json` are written.
