# Agent Handoff Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move durable agent handoff context into bounded repository contracts plus a lightweight structural checker, without changing Trapdoor product behavior.

**Architecture:** Three canonical Markdown documents define durable engineering rules, module ownership, and the task-local handoff shape. A tiny JSON state file provides stable machine pointers and prompt budgets. A Node checker validates only structural invariants and is exposed through `npm run agent:check`; the existing CI workflow remains structurally unchanged unless adding the command as one extra step is useful.

**Tech Stack:** Markdown, JSON, Node.js 24, Vitest, npm scripts, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-31-agent-handoff-contract-design.md`

## Global Constraints

- No Trapdoor product behavior changes and no edits under `src/`.
- No LLM summarizer, autonomous agent, memory database, vector store, MCP orchestration, or workflow engine.
- Keep `project-state.json` current-state-only: no SHAs, CI run IDs, test counts, task history, or changelog arrays.
- Normal bounded bugfix prompt budget: 1,500 words; complex feature prompt budget: 2,500 words.
- RED must be observed before checker implementation.

---

### Task 1: Canonical agent contracts

**Files:**
- Create: `docs/agent/project-contract.md`
- Create: `docs/agent/architecture-map.md`
- Create: `docs/agent/task-template.md`
- Create: `docs/agent/project-state.json`

**Interfaces:**
- Produces canonical paths consumed by `scripts/check-agent-contract.mjs`.
- `project-state.json` exposes `version`, `paths`, and `promptBudgetWords` only.

- [ ] Write `project-contract.md` with durable engineering invariants, startup/completion protocols, prompt budget rules, and negative handoff contract.
- [ ] Write `architecture-map.md` as a concise module → responsibility → source-path index, including Context Extractor, Challengeable Prose, Pattern Detectors, Question Generator, Ranker, Challenge Service, Feedback Store, Pit Recorder, Drill Orchestrator, Challenge Controller, and Sidebar Renderer.
- [ ] Write `task-template.md` with a reusable bounded prompt skeleton plus a real sidebar UX polish before/after migration example and approximate whitespace-token word counts.
- [ ] Write `project-state.json` with schema version 1, canonical document/spec paths, and the 1500/2500 budgets; do not duplicate release/version/history facts.

### Task 2: Agent contract checker — RED → GREEN

**Files:**
- Create first: `tests/agent-contract.test.ts`
- Create after RED: `scripts/check-agent-contract.mjs`

**Interfaces:**
- Test invokes `node scripts/check-agent-contract.mjs` from repository root.
- Checker exits `0` on success and non-zero with actionable stderr on structural contract violations.

- [ ] **RED:** add a Vitest test that spawns the checker and expects exit status `0`; before the checker exists, the assertion must fail because Node exits non-zero.
- [ ] Push the RED commit and confirm GitHub Actions `Run tests` fails for the expected missing-checker reason.
- [ ] **GREEN:** implement `scripts/check-agent-contract.mjs` using only Node built-ins.
- [ ] Validate canonical files exist.
- [ ] Parse state and reject unknown top-level/state section keys so it cannot grow into a changelog by accident.
- [ ] Validate `version === 1`, referenced paths exist, and budgets are positive integers with `bugfix <= 1500`, `feature <= 2500`, and `bugfix <= feature`.
- [ ] Read `package.json` and `manifest.json` directly and require versions to agree; do not copy the version into state.
- [ ] Require task-template headings/markers for Startup, Completion, Prompt budget, and the bounded prompt template.
- [ ] Run the focused test and full suite in CI; confirm GREEN.

### Task 3: Command and CI integration

**Files:**
- Modify: `package.json`
- Modify only if needed: `.github/workflows/ci.yml`

**Interfaces:**
- Produces `npm run agent:check`.

- [ ] Add `"agent:check": "node scripts/check-agent-contract.mjs"` to npm scripts without changing dependency versions.
- [ ] Prefer leaving the CI workflow shape intact if the checker is already exercised by `npm test`; add one explicit `Agent contract check` step only if direct command visibility materially improves evidence.
- [ ] Verify `npm test`, `npm run agent:check`, `npm run typecheck`, `npm run build`, and `npm run package` on GitHub Actions.
- [ ] Compare `main...infra/bounded-agent-handoff`; confirm no `src/` product files changed.
- [ ] Report branch, RED commit, final commit, changed files, behavioral/infrastructure change, verification result, and remaining limitation only.
