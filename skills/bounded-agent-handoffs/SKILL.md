---
name: bounded-agent-handoffs
description: Use when writing or reviewing coding-agent handoffs that are accumulating historical context, repeated project rules, old verification evidence, or long prompts that should instead recover state from the repository.
---

# Bounded Agent Handoffs

## Overview

A worker prompt is the current assignment, not project memory. Keep durable state in canonical project artifacts and make each handoff contain only information that is necessary to define the current task.

**REQUIRED BACKGROUND:** Use test-driven-development for behavior changes. When creating or changing this skill itself, use writing-skills and its pressure-scenario workflow.

## Evidence ownership

| Information | Durable home |
| --- | --- |
| Current task, scope, reproduction, acceptance, prohibitions | Handoff prompt |
| Stable engineering and architecture rules | Canonical repo docs / code contracts |
| Regressions and expected behavior | Tests |
| Old commits, merges, task completion history | Git |
| Whether the current HEAD is healthy | Current CI |

A prompt may point to these sources; it should not normally copy them.

## Authoring pattern

Keep the handoff structurally small:

1. worker/task name;
2. base branch or exact baseline only when required;
3. canonical project-state pointers plus narrowly relevant task files;
4. current task;
5. task-local reproduction or context that cannot be recovered elsewhere;
6. task-specific acceptance criteria;
7. explicit adjacent scope exclusions;
8. requested completion report, only when it differs from the project default.

Before adding background, ask: **Does the worker need this fact to know what to change or how acceptance is judged?** If not, move it to its durable owner or omit it.

After routing durable information to its owner, emit only the handoff fields above. **Scope exclusions are implementation boundaries for the worker**; they are not a place to restate omitted history, prompt-budget policy, or handoff-authoring rules.

## Pressure-scenario TDD

When changing a handoff policy, test the pressure that caused prompt growth before adding prose:

1. Capture a realistic bloated or ambiguous handoff scenario.
2. Observe the baseline failure or rationalization without the new rule.
3. Add the minimum guidance that addresses that failure.
4. Re-run the same scenario and verify compliance.
5. If a rule is mechanical (budget, repeated SHAs, copied run IDs, required sections), enforce it in tooling instead of adding more prose.

Useful pressure cases include requests to paste previous task tables "for safety", carry old CI run IDs, duplicate architecture already indexed in the repo, or exceed a prompt budget because all prior context "might matter".

## Mechanical guardrails

A checker may conservatively flag obvious bloat such as:

- exceeding the configured prompt budget;
- multiple full commit SHAs that look like history replay;
- copied historical CI/Actions run identifiers;
- repeated task-history tables.

Do not mechanically truncate prompts. A flagged prompt must be edited by moving durable information to its proper owner or documenting why the task genuinely needs it.

## Known boundary

This pattern is not an autonomous workflow system. It does not require an LLM summarizer, memory database, vector store, orchestration engine, or automatic merge policy. Mechanical checks catch obvious bloat; humans and agents still decide whether task-local context is genuinely necessary.
