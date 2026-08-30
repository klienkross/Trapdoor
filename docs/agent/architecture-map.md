# Trapdoor Architecture Map

This is a routing index: module → responsibility → canonical source. Read the owning source/tests for details; do not grow this into an implementation guide.

| Capability | Responsibility | Canonical source |
| --- | --- | --- |
| Context Extractor | Extract current section / whole-note context with source offsets. | `src/context/context-extractor.ts` |
| Suitability Detector | Decide whether a context is suitable for challenge generation using transparent signals. | `src/context/suitability-detector.ts` |
| Challengeable Prose | Project raw Markdown into detector-safe prose while preserving source mapping. | `src/detection/challengeable-prose.ts` |
| Pattern Detectors | Detect local structural challenge patterns such as causal, definition, evidence, comparison, list, and summary relations. | `src/detection/pattern-detector.ts`, `src/detection/detectors/` |
| Question Generator | Turn typed detections into deterministic challenge candidates/templates. | `src/generation/question-generator.ts` |
| Ranker | Score candidates transparently using priors, novelty, repetition, and feedback. | `src/ranking/question-ranker.ts` |
| Challenge Service | Orchestrate section-first detection/generation/ranking with whole-note fallback. | `src/challenge/challenge-service.ts` |
| Feedback Store | Maintain bounded feedback history, counters, and note-local suppression state. | `src/feedback/feedback-store.ts` |
| Pit Recorder | Render and insert durable `认知坑` callouts into the correct note position. | `src/pits/pit-recorder.ts` |
| Drill Orchestrator | Run follow-up Socratic turns and whole-note escalation over the LLM provider boundary. | `src/llm/drill-orchestrator.ts` |
| Provider Adapter | Call an OpenAI-compatible Chat Completions endpoint behind the provider interface. | `src/llm/openai-compatible-provider.ts` |
| Persistence | Persist plugin settings and long-term question feedback. | `src/persistence/` |
| Challenge Controller | Own application actions/state transitions and coordinate note, challenge, feedback, pit, and drill services. | `src/app/challenge-controller.ts` |
| Active Note Adapter | Resolve/read/write the current or most-recent Markdown note through Obsidian. | `src/app/obsidian-active-note-adapter.ts` |
| Sidebar Renderer/View | Render sidebar DOM/state and user interactions; product orchestration stays outside the renderer. | `src/ui/` |
| Plugin Wiring | Register views, commands, settings, adapters, and services. | `src/main.ts` |

## Ownership rule

Route a bug to the lowest layer that owns the broken semantic contract. A downstream renderer should not compensate for malformed detector semantics; a detector should not implement application orchestration; controller bugs should not be patched by changing persistence semantics unless persistence itself is wrong.

## Finding details

Start with the source path above, then inspect sibling tests under `tests/`. Use Git history for why/when a behavior changed and the current CI run for whether HEAD is verified. Do not copy those histories into this map.
