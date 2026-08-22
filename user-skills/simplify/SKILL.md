---
name: simplify
description: Behavior-preserving simplification for readability and maintainability. Use when asked to simplify, clean up, or make code more maintainable without changing its behavior.
---

# Simplify

Clarity-focused refactoring with zero intended behavior change. This is the
only bundled skill the `oracle` specialist uses.

## Principles

- **Behavior is frozen.** Tests, types, public APIs, wire formats, error
  messages, and observable timing-sensitive behavior must stay identical
  unless a change is explicitly approved.
- **Make the code easier to reason about**, not shorter for its own sake:
  better names, clearer structure, fewer indirections, deleted dead code that
  is provably unreachable.
- **Prefer small, reviewable steps.** One concern per edit; no mixed cleanup
  and feature work.
- **Preserve project conventions.** Do not restyle files not being touched.

## Workflow

1. Inspect the target: read the file(s), locate tests and call sites with
   `grep` / `glob` / `ast_grep_search`.
2. Record the pre-change behavior and how it is verified (existing tests,
   typecheck, build, or explicit "no verifier available").
3. Simplify incrementally. After each logical step, run the narrowest
   relevant verifier.
4. Review the diff for accidental behavior change before finishing:
   - input/output paths unchanged;
   - control flow equivalent;
   - error handling equivalent;
   - no dependency or lockfile changes.
5. Report what changed, why it is behavior-preserving, and the evidence.

## Rules

- Never change an API, schema, or error contract to "make it cleaner".
- If a simplification cannot be proven behavior-preserving with available
  evidence, stop and say so.
- This skill does not authorize broad dependency upgrades or mass reformat.
- You are read-only in spirit until edits are requested; simplification work
  itself is performed by the specialist the orchestrator assigns.
