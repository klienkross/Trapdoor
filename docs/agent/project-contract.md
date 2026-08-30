# Trapdoor Agent Project Contract

This file contains durable engineering rules for coding workers. Task prompts should point here instead of copying these rules.

## Engineering invariants

- Work from the task's requested base branch; do not modify `main` directly unless explicitly asked.
- Use strict TDD for behavior changes: RED → confirm the expected failure → GREEN → verify.
- Spec beats plan when they conflict.
- Change only the layer and behavior required by the current task. Do not fold unrelated cleanup or product expansion into a bounded change.
- Production behavior must not be weakened or bypassed to make tests pass.
- Do not claim a test, build, package, manual smoke, or CI result that was not actually observed.
- Trapdoor is an Obsidian plugin written in TypeScript with Vitest tests. Keep `obsidian` external in the production bundle.
- Prefer explicit, deterministic seams over hidden heuristics. Preserve existing typed contracts unless the task requires changing them.
- Regression tests are durable project memory. Once a behavior is protected by a relevant regression test, future handoffs should not restate its whole bug history.

## Evidence ownership

- **Tests are memory:** behavioral regressions belong in tests.
- **Repo docs are contracts:** stable engineering/architecture rules belong in canonical docs.
- **Git is history:** commits, SHAs, merges, and old task completion records stay in Git.
- **CI is evidence:** current verification status comes from the current HEAD's checks, not from copied historical run IDs.
- **Prompt is the current assignment:** carry only task-local scope, reproduction, acceptance criteria, prohibitions, and pointers needed to recover context.

## Worker startup protocol

1. Inspect the requested base branch, current branch, and HEAD.
2. Read this contract.
3. Read `docs/agent/architecture-map.md`.
4. Read only task-specific specs/docs named by the handoff or discovered from the owning module.
5. Inspect the relevant source and tests.
6. Verify the current baseline before attributing new failures to the task.
7. For behavior changes, create RED and confirm the failure reason.
8. Implement the minimum scoped change.
9. Run focused verification, then the applicable full test/typecheck/build/package checks and inspect CI when available.

The handoff writer should not pre-copy steps 1–5 into the prompt.

## Worker completion protocol

Default completion reports contain only:

- branch;
- RED commit (when TDD applies);
- final commit;
- changed files;
- concise behavioral/infrastructure change;
- verification result;
- known remaining limitation, if any.

Use changed files plus one concise scope statement to show scope control. Do not enumerate every untouched module by default.

## Prompt budget

- Normal bounded bugfix: **≤ 1,500 words**.
- Complex feature: **≤ 2,500 words**.

Do not mechanically truncate a prompt to fit. If a handoff exceeds its budget, explain why the extra information cannot instead live in canonical docs, tests, code, Git, or CI.

## Negative handoff contract

Do not routinely put these in worker prompts:

- old Task N → commit SHA tables;
- historical Actions run IDs, past test counts, or statements that an earlier HEAD was green;
- complete architecture descriptions already indexed by `architecture-map.md`;
- stable module invariants that are already represented by code/contracts/regression tests;
- prose translations of existing regression tests;
- old bug narratives not needed to reproduce the current task;
- project-wide TDD/verification philosophy already defined here;
- release/changelog history that Git or release metadata can answer.

A specific SHA belongs in a prompt only when that exact SHA is necessary to define the current task's baseline or comparison target.

## Scope boundary for this contract

This contract does not define an autonomous agent framework. It does not grant permission for broad refactors, automatic merges, LLM summarization, memory databases, vector stores, MCP orchestration, or workflow engines.
