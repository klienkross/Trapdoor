# Agent Handoff Contract Design

## Goal

Keep Trapdoor worker handoffs bounded by moving durable project truth out of prompts and into the repository, tests, Git, and CI.

> Prompt is only the current assignment. Tests are memory. Repo docs are contracts. Git is history. CI is evidence.

## Information layers

### Layer 1: canonical project contract

`docs/agent/project-contract.md` contains long-lived engineering invariants and the negative contract for handoffs. It must not become a task history, changelog, CI ledger, or bug diary.

### Layer 2: architecture/capability map

`docs/agent/architecture-map.md` maps current modules to responsibilities and source paths. It is an index for locating ownership, not a duplicate implementation guide.

### Layer 3: small machine-readable current state

`docs/agent/project-state.json` provides a stable machine entry point containing only values that are useful to handoff tooling and cheap to validate. Derived facts stay derived: Git history stays in Git; package and manifest versions stay authoritative in their own files; CI history stays in Actions.

The state file records a schema version plus canonical paths and prompt budgets. It deliberately does not record release history, commit SHAs, run IDs, test counts, task completion history, or bug history.

### Layer 4: task-local prompt

`docs/agent/task-template.md` defines the bounded worker prompt shape. A normal worker handoff carries only task identity, allowed scope, explicit prohibitions, task-specific reproduction/acceptance criteria, and pointers to canonical repo state.

## Startup protocol

Workers restore context instead of receiving it pre-expanded:

1. inspect branch and HEAD;
2. read `docs/agent/project-contract.md`;
3. read `docs/agent/architecture-map.md`;
4. read task-specific specs/files;
5. inspect relevant tests/source;
6. verify the current baseline;
7. create and verify RED;
8. implement the minimum change;
9. verify the focused and full checks.

The upstream prompt must not copy steps 1-5 into prose when the repository can answer them directly.

## Completion protocol

Default completion reports stay bounded to:

- branch;
- RED commit;
- final commit;
- changed files;
- behavioral change;
- verification result;
- known remaining limitation.

Scope control is normally demonstrated by the changed-file list plus one concise statement rather than enumerating every untouched module.

## Prompt budget

- normal bounded bugfix: at most 1,500 words;
- complex feature: at most 2,500 words.

Exceeding the budget is not solved by truncation. The handoff author must explain why the extra information cannot live in canonical docs, tests, code, Git, or CI instead.

## Negative contract

Worker prompts should not carry:

- task/commit history unless one SHA is necessary as the current task baseline;
- historical CI run IDs, test counts, or previous green results;
- stable architecture facts already available from canonical docs/source;
- prose restatements of regression behavior already protected by tests;
- old bug-fix narratives that are not needed to reproduce the current task;
- project-wide test philosophy already in the project contract.

## Automated checker

Add `npm run agent:check`, implemented by a small Node script. It validates only cheap structural invariants:

- canonical agent files exist;
- `project-state.json` parses and has exactly the bounded supported shape;
- every canonical path referenced by state exists;
- prompt budgets remain positive and within their declared ceilings;
- package and manifest versions agree (read directly, not copied into state);
- the task template contains required startup/completion/budget sections.

The checker is intentionally not an agent framework. It does not summarize prompts, interpret task history, query GitHub, score prose quality, or orchestrate workers.

## Migration example

Use the recent sidebar UX polish handoff as the example in `task-template.md`. The old handoff included renderer shape, UI excerpts, merge baseline/history context, and repeated project constraints. The bounded rewrite points the worker to canonical docs and relevant sidebar source/tests, then carries only the three requested UI changes, reproduction-specific acceptance criteria, and explicit scope exclusions.

Word counts are recorded as reproducible approximate counts using whitespace-delimited tokens for the exact before/after example text embedded in the template. The purpose is not linguistic precision; it is to demonstrate the order-of-magnitude reduction while preserving recoverability from repo state.

## Non-goals

This change does not modify Trapdoor product behavior and does not add an autonomous coding agent, LLM summarizer, memory database, vector store, MCP orchestration, CI rewrite, or workflow engine.
