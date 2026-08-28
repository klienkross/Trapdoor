# Cognitive Friction Obsidian Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an Obsidian plugin that locally generates and ranks cognitive-friction questions from the current note, records feedback, writes durable “pits,” and optionally continues with an OpenAI-compatible LLM Socratic drill.

**Architecture:** Keep first-question generation deterministic and local: extract context → measure suitability → detect structures → generate candidates → rank → show one question. Feedback remains lightweight and local. LLM use is isolated behind a provider adapter and only starts after `继续拷打`.

**Tech Stack:** TypeScript, Obsidian Plugin API, Vitest, jsdom, native `fetch`.

**Spec:** `docs/superpowers/specs/2026-08-29-cognitive-friction-obsidian-plugin-design.md`

## Global Constraints

- First-question generation must work without an LLM call.
- Current heading section first; whole-note fallback only when needed.
- Exactly six MVP categories: `causal_gap`, `definition_boundary`, `evidence_jump`, `comparison_compression`, `list_structure`, `summary_compression`.
- `什么破问题` never triggers LLM.
- `换一个` is not negative feedback.
- Only `有东西` and `答不上来` create durable note content.
- LLM drill asks one question at a time and expands to whole note only when needed.
- OpenAI-compatible provider first; internal provider interface remains adapter-shaped.
- Personality copy is event-driven and local, never LLM-generated.
- Debug mode exposes score components.
- No embeddings, cross-vault semantic search, fact checking, spaced repetition, cloud account, or aggressive auto-learning in MVP.

## Proposed File Map

- `src/main.ts` — lifecycle, registrations, dependency wiring
- `src/settings.ts` — Obsidian settings
- `src/domain/types.ts` — domain types
- `src/context/context-extractor.ts` — current section / whole-note extraction
- `src/context/suitability-detector.ts` — exploration score
- `src/detection/pattern-detector.ts` + `src/detection/detectors/*.ts` — six structural detectors
- `src/generation/templates.ts` — local question templates and priors
- `src/generation/question-generator.ts` — detections → candidates
- `src/ranking/question-ranker.ts` — scoring / ordering
- `src/feedback/feedback-store.ts` — persistent stats + note-local suppression
- `src/pits/pit-recorder.ts` — durable pit insertion
- `src/llm/provider.ts` — provider interface
- `src/llm/openai-compatible-provider.ts` — HTTP adapter
- `src/llm/drill-orchestrator.ts` — constrained follow-up
- `src/copy/copy-system.ts` — event copy + cooldowns
- `src/ui/challenge-view.ts` — sidebar state machine
- `src/debug/debug-format.ts` — score explanation
- `tests/**` — unit / ranking / integration fixtures

---

### Task 1: Project Skeleton, Domain Types, and Test Harness

Create package/build/test configuration, `manifest.json`, `src/main.ts`, and domain types for challenge categories, contexts, detections, score breakdowns, candidates, feedback actions, and drill turns. Start with a failing Vitest type-level smoke test, make it pass, then commit.

### Task 2: Current Heading Section Extraction

Implement `extractSection(markdown, cursorOffset, notePath)` and `extractWholeNote(markdown, notePath)`. Preserve absolute offsets for later pit insertion. Test heading-boundary behavior and whole-note fallback data.

### Task 3: Suitability Detector

Implement `measureExploration(text)` returning `{ score, signals, shouldSkip }`. Use question-mark density, uncertainty terms, TODO/draft markers, and competing-hypothesis cues. MVP skip threshold: `0.8`.

### Task 4: Six Structural Pattern Detectors

Create focused detector modules for causal gap, definition boundary, evidence jump, comparison compression, list structure, and summary compression. Each detector returns confidence, source, targets, and trigger terms. Add one representative failing test per category before implementation.

### Task 5: Local Question Templates and Candidate Generation

Define typed templates with `id`, category, renderer, diagnosticity prior, followupability prior, and follow-up routes. Include at least two templates per category. Implement `generateCandidates(detections)`.

### Task 6: Feedback Store

Implement bounded recent history, template/category counters, beta-smoothed bad rate `(bad + 1) / (shown + 4)`, and note-local suppression. `replace` must never increment bad feedback.

### Task 7: Transparent Candidate Ranking

Implement published positive weights and penalties from the design spec. Add centrality, novelty, repetition penalty, dislike penalty, exploration penalty, and debug formatting. Prefer pairwise ranking fixtures over exact-score tests.

### Task 8: Challenge Selection Service

Compose extractor, suitability detector, pattern detector, generator, and ranker. Return one of `question`, `not_suitable`, or `none`. Start with current section; fall back to whole note only when no viable section candidate exceeds initial threshold `0.35`.

### Task 9: Pit Recorder

Implement `buildPitCallout(candidate)` and `insertPit(markdown, candidate)`. Insert durable `认知坑` callouts near the relevant source section. Do not persist bad/replaced questions.

### Task 10: Event-Driven Copy System

Implement a centralized copy table for events such as `bad_question`, `bad_question_streak`, `pit_saved`, `not_suitable`, `feedback_reset`, `legacy_state_found`, and `drill_exhausted`. Add deterministic rotation and cooldowns for testability.

### Task 11: OpenAI-Compatible Provider Adapter

Define `LLMProvider.complete(messages, signal?)`. Implement `${endpoint}/chat/completions`, injected fetch for tests, endpoint normalization, typed non-2xx errors, and extraction of `choices[0].message.content`.

### Task 12: Socratic Drill Orchestrator

Build constrained prompt assembly: exactly one question, no unsolicited full answer, target gaps in the user's answer, stop hard-pushing once sufficiently explained. Use current section first; permit one whole-note escalation if more context is explicitly needed.

### Task 13: Obsidian Settings and Persistence

Expose endpoint, model, API key, and debug mode. Persist normal settings in Obsidian `data.json` and human-readable challenge feedback separately. Detect surviving legacy feedback after reinstall and emit one-time `哦。旧账还在。`-style copy.

### Task 14: Sidebar Challenge View

Implement UI states `idle`, `question`, `drill`, `pit_saved`, and `not_suitable`. Idle shows the large `推我下去` button. Question state shows exactly one question plus `继续拷打 / 有东西 / 答不上来 / 什么破问题 / 换一个`. Only `继续拷打` may invoke LLM. Debug mode displays score breakdown.

### Task 15: Command Palette / Hotkey Trigger

Register the sidebar view and a command that triggers the exact same `requestChallenge()` path as the large button. Avoid duplicate challenge-generation logic.

### Task 16: End-to-End Behavioral Tests and Manual Smoke Checklist

Integration-test the complete local loop: generate locally, verify no network call before drill, reject changes ranking, replace does not count as bad, useful/cannot-answer produces pit Markdown. Run full tests and TypeScript build.

Manual smoke checklist must verify:
- tidy-note challenge from current section
- no network before `继续拷打`
- near-duplicate suppression after repeated `什么破问题`
- `换一个` does not increase bad count
- `有东西` writes a nearby `认知坑`
- speculative notes trigger `not_suitable`
- one LLM follow-up per answer
- debug score visibility
- reinstall with surviving feedback shows legacy-state copy once

---

## Post-MVP Tuning Protocol

When a real note produces a bad question, diagnose in this order:
1. detector/category choice
2. extracted target/source span
3. centrality and diagnosticity assumptions
4. local repetition/dislike penalties
5. category priors
6. global weights last

Every representative ranking failure should become a minimized regression fixture before changing scoring logic.