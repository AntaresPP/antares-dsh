---
name: deepwork
description: High-cost orchestrator workflow for large, high-risk, multi-phase coding efforts with dependencies and review gates. Use for /deepwork requests, cross-cutting refactors, unsafe-to-partially-ship migrations, and sustained coordination across specialists. Do not activate for routine multi-file changes.
---

# Deepwork

Deepwork turns the orchestrator into a scheduler for heavy coding sessions.
Use it only when the work is clearly large or high-risk: multiple dependent
phases, cross-cutting architectural change, unsafe partial migration, or
sustained coordination across several specialist lanes.

## Core contract

When deepwork is active, the orchestrator manages the work as a scheduler,
not as the default implementation worker.

## Setup and state

1. Before planning or creating state, inspect `.gitignore` and `.ignore`.
   Add only missing entries, without duplicates:
   - `.gitignore` must contain `.dsh/antares-dsh/deepwork/`
   - `.ignore` must contain `!.dsh/antares-dsh/deepwork/` and
     `!.dsh/antares-dsh/deepwork/**`
2. Create `.dsh/antares-dsh/deepwork/<task-slug>.md`. Choose whatever
   markdown structure fits the task, but keep it useful:
   - current goal and understanding;
   - researched facts (from `librarian` when external research is needed);
   - phase order, specialist ownership, review gates and their rationale;
   - implementation status per phase;
   - validation results, unresolved questions, blockers, follow-ups.
3. Code and docs deliverables go to normal project paths. Reserve
   `.dsh/antares-dsh/deepwork/` strictly for progress files.
4. Update the file after every major decision, research, review, phase
   completion, validation result, or scope change. Reference local files by
   path instead of copying contents.

## Planning

- Draft the plan before implementation.
- Choose a small number of coherent phases based on dependencies and natural
  delivery boundaries. Do not split work merely to shrink an oracle review.
- Before execution, declare the phase order, specialist ownership, and a
  mandatory `oracle` review gate after each phase. Record this in the state
  file and show the user a compact version.
- Before each phase, replace the `todo_write` list with actionable delivery
  todos for that phase only.

## Execution loop

1. Dispatch the phase's independent work as background specialist calls
   (`explorer`, `librarian`, `fixer`, `designer`, ...). Use one assistant
   message for independent starts.
2. Do not busy-poll. Wait for each child's completion notice. Keep doing only
   safe, independent coordination work in the meantime.
3. When the relevant children settle, reconcile their outputs against each
   other and the original goal. Use `job_output` / `list_agents` only to
   collect outstanding results.
4. Validate the final state with focused evidence. Do not broaden validation
   beyond what the phase needs.
5. Update the state file, then call the `oracle` tool for the declared
   per-phase review.
6. Batch material oracle findings into one bounded remediation pass, validate
   it, and re-review only when remediation changes the reviewed decision or
   the original concern cannot otherwise be verified.
7. Advance to the next phase only after the gate passes.

## Verification

Verification stays orchestrator-owned and proportionate. Use focused checks
against the final state; broaden only when risk or uncertainty warrants it.
Oracle review is the declared gate, not a substitute for running the checks.

## Completion

Only finish when every phase is complete, all reviews are reconciled, and
final-state evidence supports the claim. Report phases completed, evidence
per phase, and remaining risks or follow-ups.
