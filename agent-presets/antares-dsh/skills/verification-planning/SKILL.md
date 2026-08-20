---
name: verification-planning
description: Plan a project-specific evidence path before non-trivial changes: what must be established, its failure modes, and the narrowest credible verification. Activate before implementation, bug fixes, refactors, multi-layer changes, or externally visible behavior.
---

# Verification Planning

Design how a non-trivial change will be proven before work begins. Do not
default to a familiar test command; derive the evidence path from what the
change claims and what could make the claim false.

## When to use

Non-trivial implementation, bug fix, refactor, multi-layer change, or
externally visible behavior change.

## When NOT to use

Tiny mechanical edits. Never prescribe heavy verification machinery for a
one-line change.

## Steps

### 1. State the claim

- What exactly must be true when the work is done?
- How uncertain is that claim?
- What are the concrete failure modes (wrong branch, boundary, regression,
  silent failure, partial state)?

### 2. Inventory controllable evidence

Look for evidence paths among:

- controllable inputs and state transitions;
- boundaries and invariants;
- build/test/lint/typecheck artifacts;
- runtime outputs, logs, metrics;
- reversibility and repeatability (can the check be re-run identically?).

Prefer evidence another agent or person can inspect independently.

### 3. Choose the narrowest credible path

Rank candidates by credibility, signal quality, cost, and safety. Pick the
narrowest path that actually settles the claim.

### 4. Improve legibility only when needed

When the system cannot expose decisive truth, you may add the smallest
temporary or durable verification affordance: a test seam, a script, a
diagnostic endpoint, a repeatable command. Temporary support must be removed;
durable support needs a clear justification and user approval.

### 5. Research before deciding when uncertain

When the relevant project facilities or constraints are unfamiliar or
changing, call the `librarian` tool for focused official and project-specific
research. Do not seek generic testing advice when current evidence is already
decisive.

## Rules

- Approval is required for verification-only dependencies, persistent
  instrumentation, production debug surfaces, or structural changes.
- The plan may use `bash`, test runners, `grep`, `ast_grep_search`, or any
  existing tool, but never mutates project code just to make verification
  easier without approval.
- Completed work must report what was established and its limitations.
