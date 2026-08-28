# Cognitive Friction Obsidian Plugin — Design Spec

## 1. Purpose

Build an Obsidian plugin for the specific moment when a user has just finished reading or taking notes and feels “I seem to understand this, but I have nothing to ask.” The plugin should manufacture a small, targeted cognitive conflict that tests whether apparent fluency is real understanding.

This is not a general-purpose tutor, fact checker, reasoning judge, or brainstorming critic. It is specifically an **understanding-completion-feeling disruptor**.

## 2. Product Positioning

Primary use case:
- User has just made notes from a book, lecture, paper, or other source.
- The note is structurally tidy and mostly declarative.
- The user feels the content is familiar or “understood,” but has not yet tested transfer, mechanism, boundary, evidence, or counterexamples.
- The user wants a low-friction prompt to expose shallow understanding.

Explicit non-goals:
- Do not decide whether the user’s reasoning is objectively correct.
- Do not fact-check claims against external sources.
- Do not constrain active brainstorming or speculative notes.
- Do not become a spaced-repetition system.
- Do not become a second knowledge-management system.
- Do not require embeddings, cross-vault semantic search, or graph analysis in MVP.

## 3. Core Interaction

### 3.1 Entry points

Two equivalent entry points:
- A persistent right-sidebar pane with a large “press when bored” button.
- A command palette action / assignable hotkey.

Default button copy: `推我下去`.

### 3.2 Context scope

Context strategy is adaptive:
1. Start from the heading section containing the cursor.
2. If the section is too small or structurally weak for a worthwhile challenge, expand to the whole current note.
3. MVP never reads linked notes automatically.

### 3.3 Default flow

Default flow is lightweight and local:
1. User presses the button.
2. Plugin extracts current context.
3. Plugin checks whether the note appears suitable for cognitive-friction prompting.
4. Plugin detects candidate structures.
5. Plugin generates several local candidate questions.
6. Plugin scores and ranks them.
7. Plugin shows exactly one question.

Question-state actions:
- `继续拷打` — enter LLM-powered Socratic follow-up mode.
- `有东西` — mark the question useful and save as a pit.
- `答不上来` — mark as a pit.
- `什么破问题` — negative feedback, suppress similar local candidates, then replace the question.
- `换一个` — replace without treating it as negative feedback.

### 3.4 LLM role

MVP uses an LLM only after `继续拷打`.

First challenge generation remains local and zero-call by default. If testing shows too many poor local questions, a later mode may allow LLM-assisted first-question ranking or generation.

The LLM must:
- Ask one question at a time.
- Target gaps in the user’s answer: missing mechanism, vague terms, unsupported premise, alternative explanations, boundaries, or counterexamples.
- Avoid giving the full answer by default.
- Stop hard-pushing once the user has adequately explained the current issue; then switch attack angle or conclude the drill.
- Use current section + conversation first; expand to whole note only if needed.

Provider policy:
- MVP UI supports an OpenAI-compatible endpoint.
- Internal provider interface must be adapter-shaped so future Anthropic/Gemini/local adapters do not require rewriting challenge logic.

## 4. Suitability / “Already Unstable” Detection

The plugin should avoid attacking notes that already contain obvious cognitive conflict.

Signals that increase `explorationScore`:
- High question-mark density.
- Frequent uncertainty terms such as `可能`, `也许`, `猜测`, `不确定`, `待验证`, `TODO`.
- Explicit brainstorming / draft markers.
- Multiple competing hypotheses or alternatives.
- Dense counterexample / objection writing.

Behavior:
- Low exploration score: proceed normally.
- Medium exploration score: reduce all candidate scores.
- High exploration score: do not generate a challenge.

Example refusal copy:
- `你已经在怀疑了。今天不用我推。`
- `这段已经够不稳了，我先不添乱。`

This is a heuristic, not a judgment of note quality.

## 5. MVP Challenge Categories

MVP has six local challenge categories.

### 5.1 `causal_gap`
Trigger cues:
- 因为 / 所以 / 导致 / 因此 / 从而 / 使得 / 结果是

Purpose:
- Expand compressed causal chains.

Example:
- Source: `X 导致 Y。`
- Prompt: `“导致”这两个字省掉了哪两步？`

### 5.2 `definition_boundary`
Trigger cues:
- 是 / 指的是 / 定义为 / 本质上 / 可以理解为

Purpose:
- Test boundaries, counterexamples, and neighboring concepts.

Example:
- `什么东西看起来像 X，但其实不算？`

### 5.3 `evidence_jump`
Trigger cues:
- 说明 / 表明 / 可见 / 证明 / 意味着

Purpose:
- Test whether the conclusion is actually supported by a discriminating observation.

Example:
- `哪一个具体事实最能让这个结论站住？`

### 5.4 `comparison_compression`
Trigger cues:
- 相比 / 不同于 / 区别在于 / 优于 / 更多 / 更少 / 更灵活

Purpose:
- Expose hidden comparison dimensions.

Example:
- `“更灵活”到底指哪个维度？换个维度结论还成立吗？`

### 5.5 `list_structure`
Trigger cues:
- Headings followed by bullet or numbered lists.
- Multiple parallel items describing a concept.

Purpose:
- Test hierarchy, necessity, and organizing principle.

Example:
- `如果只能留一个，哪个最能区分 X 和别的东西？`

### 5.6 `summary_compression`
Trigger cues:
- 总的来说 / 归根结底 / 可以看出 / 本质上

Purpose:
- Expand hidden assumptions or excluded explanations.

Example:
- `“归根结底”前面到底排除了哪些别的解释？`

## 6. Candidate Model

```ts
type ChallengeCategory =
  | "causal_gap"
  | "definition_boundary"
  | "evidence_jump"
  | "comparison_compression"
  | "list_structure"
  | "summary_compression";

type FollowupRoute =
  | "mechanism"
  | "evidence"
  | "counterexample"
  | "alternative_cause"
  | "boundary"
  | "comparison_dimension"
  | "necessary_condition"
  | "sufficient_condition"
  | "organizing_principle";

type ScoreBreakdown = {
  structure: number;
  centrality: number;
  diagnosticity: number;
  followupability: number;
  novelty: number;
  repetitionPenalty: number;
  dislikePenalty: number;
  explorationPenalty: number;
  final: number;
};

type QuestionCandidate = {
  id: string;
  category: ChallengeCategory;
  templateId: string;
  question: string;
  source: {
    notePath: string;
    heading: string | null;
    from: number;
    to: number;
    text: string;
  };
  targets: string[];
  triggerTerms: string[];
  scores: ScoreBreakdown;
  followupRoutes: FollowupRoute[];
};
```

## 7. Scoring Model

MVP scoring is a transparent heuristic intended to be tuned during testing.

Initial positive score:

```text
positive =
  structure * 0.25 +
  centrality * 0.20 +
  diagnosticity * 0.25 +
  followupability * 0.15 +
  novelty * 0.15
```

Final score:

```text
final =
  positive
  - repetitionPenalty
  - dislikePenalty
  - explorationPenalty
```

All component scores are normalized to `[0, 1]`. Final score may be clamped to `[0, 1]` for UI display, while raw pre-clamp values may remain available in debug logs.

### 7.1 Structure confidence

Each detector owns its trigger confidence rules.

Example for causality:
- Explicit paired cause/result structure in one span: 1.0
- Strong single causal marker (`导致`, `因此`): 0.8
- Weak causal relation (`影响`, `促进`): 0.5
- Mere proximity without relation marker: 0.2

### 7.2 Centrality

MVP centrality is rule-based, not graph-based.

Possible contributions:
- First paragraph after heading: +0.25
- Contains heading keywords: +0.20
- Contains bold / highlight / wikilink target: +0.15
- Core term repeated in section: +0.20
- Paragraph-ending or section-summary position: +0.15

Clamp to 1.0.

### 7.3 Diagnosticity

Diagnosticity measures how likely a question is to distinguish real understanding from successful copying.

Initial category priors:

| Category | Diagnosticity |
|---|---:|
| causal_gap | 0.90 |
| definition_boundary | 0.85 |
| evidence_jump | 0.90 |
| comparison_compression | 0.80 |
| list_structure | 0.70 |
| summary_compression | 0.85 |

Low-diagnostic patterns such as pure restatement should not be generated in MVP.

### 7.4 Followupability

Followupability measures whether a user answer creates at least two natural next attack directions.

Initial priors:

| Category | Followupability | Typical route |
|---|---:|---|
| causal_gap | 0.95 | mechanism → evidence → alternative cause → boundary |
| definition_boundary | 0.85 | counterexample → neighboring concept → necessary condition |
| evidence_jump | 0.90 | evidence → alternative explanation → discriminating evidence |
| comparison_compression | 0.80 | dimension → alternative dimension → exception |
| list_structure | 0.65 | hierarchy → deletion test → organizing principle |
| summary_compression | 0.85 | hidden premise → excluded explanation → counterexample |

A template may add a small modifier if it extracts specific concepts or comparison objects. Very broad prompts lose followupability.

### 7.5 Novelty

Novelty penalizes overused categories and source spans.

MVP strategy:
- Compute category frequency across the last 10 shown questions.
- `novelty = 1 - recentCategoryFrequency`.
- Apply an additional reduction if the same or nearby source span was recently challenged.

### 7.6 Repetition penalty

Harder than novelty; prevents near-duplicate questions.

Rules:
- Same source + same category: large penalty (initially 0.8).
- Same source + different category: moderate penalty (initially 0.3).
- Same template + same target concepts in recent history: large penalty.

No embeddings are required in MVP.

### 7.7 Dislike penalty

Two layers:
- Long-term user preference.
- Note-local immediate irritation.

Long-term smoothed bad rate:

```text
badRate = (bad + 1) / (shown + 4)
```

This reduces sensitivity to tiny sample sizes.

Note-local behavior is stronger:
- Same category just rejected: strong short-term penalty.
- Same template just rejected: near-cooldown.
- Repeated rejection of similar questions suppresses them for the current note/session.

`什么破问题` means “this question was bad,” not “ban this category forever.” Long-term category weight changes only gradually with repeated evidence.

### 7.8 Exploration penalty

`explorationPenalty` is derived from the context-level `explorationScore`.

A high exploration score may skip generation entirely.

## 8. Feedback and Learning

Persistent feedback should be local, human-readable, and conservative.

### 8.1 Actions

`什么破问题`:
- Increment negative feedback for template/category.
- Add current-note local suppression.
- Replace immediately.
- Never call the LLM as a side effect.

`有东西`:
- Increment useful feedback.
- Save the challenge as a pit.

`答不上来`:
- Save as a pit.
- May increment useful/diagnostic feedback separately from positive sentiment.

`换一个`:
- Replace without negative feedback.

### 8.2 Automatic adaptation

MVP records feedback but does not perform aggressive self-tuning.

Allowed adaptation:
- Local cooldown and suppression.
- Small long-term penalty derived from smoothed historical rates.

Not allowed in MVP:
- Automatically rewriting template weights based on a few sessions.
- LLM-based preference modeling.

## 9. Pit Recording

Normal questions remain ephemeral.

Only `有东西` and `答不上来` leave durable traces.

Default behavior:
- Save pit in the current note.
- If context is long and locality matters, insert near the current heading/source section rather than a distant note-bottom archive.
- Maintain only a lightweight index in plugin state if needed for future revisit features.

MVP does not create a parallel pit knowledge base.

Suggested inserted form:

```markdown
> [!question] 认知坑
> “导致”这两个字省掉了哪两步？
```

Exact syntax remains configurable later; MVP may use a fixed callout form.

## 10. Persistence

Use local human-readable state.

### 10.1 `data.json`
Normal Obsidian plugin settings:
- OpenAI-compatible endpoint.
- Model.
- API credential reference/value according to Obsidian plugin conventions.
- Debug mode.
- Copy/personality intensity if exposed.

### 10.2 `question-feedback.json`
Long-term challenge feedback, e.g.:

```json
{
  "templates": {
    "causal-gap-03": {
      "shown": 18,
      "bad": 5,
      "useful": 7
    }
  }
}
```

### 10.3 Note-local transient state

Persist only if needed across view reloads:

```json
{
  "notePath": "example.md",
  "recentRejectedCategories": ["causal_gap"],
  "recentQuestionHashes": ["abc123"],
  "lastChallengeAt": 0
}
```

This state should expire or be bounded so it does not grow indefinitely.

### 10.4 Reinstall / legacy-state behavior

If a user removes and later reinstalls the plugin while feedback state remains, the plugin may recognize the old state and show a one-time event copy such as:
- `哦。旧账还在。`

Configuration and feedback files should be intentionally readable and manually editable where practical.

## 11. Event-Driven Copy System

Plugin personality is event-driven and secondary to function. Copy must not randomly interrupt the user.

```ts
type CopyEvent =
  | "idle_prompt"
  | "bad_question"
  | "bad_question_streak"
  | "pit_saved"
  | "not_suitable"
  | "feedback_reset"
  | "legacy_state_found"
  | "drill_exhausted";
```

Example copy:
- `bad_question`: `行，这题确实不太行。`
- `bad_question_streak`: `今天我问得像坏掉的教辅。`
- `not_suitable`: `你已经在怀疑了。今天不用我推。`
- `legacy_state_found`: `哦。旧账还在。`
- `feedback_reset`: `好。我们重新认识。`

Rules:
- Events have cooldowns.
- Copy does not alter challenge logic.
- LLM does not generate UI personality copy in MVP.
- Clearing feedback must actually clear it; no hidden retained copy of user history.

## 12. UI State Machine

States:

### `idle`
- Large button.
- Minimal context indicator, e.g. `当前小节` / `整篇` when useful.

### `question`
- One question card.
- Source-context affordance may reveal where the question came from.
- Actions: continue drill, useful, cannot answer, bad question, replace.

### `drill`
- Compact short conversation.
- One LLM question at a time.
- Always allow exit back to single-question mode.

### `pit_saved`
- Small acknowledgement indicating where the pit was written.

### `not_suitable`
- Shows refusal copy and allows manual override / `还是问一个` only if later testing justifies it. Manual override is not required for MVP.

## 13. Debug Mode

Debug mode is critical for tuning.

For each shown candidate, expose or log:
- Category.
- Template ID.
- Source span.
- Trigger terms.
- Structure score.
- Centrality.
- Diagnosticity.
- Followupability.
- Novelty.
- Repetition penalty.
- Dislike penalty.
- Exploration penalty.
- Final score.
- Competing top candidates and why they lost, if practical.

Example compact line:

```text
causal_gap | structure .80 | centrality .60 | diagnosticity .90 | followup .95 | novelty .40 | final .71
```

The scoring system is expected to be repeatedly tuned during real-note testing.

Preferred tuning order:
1. Fix detectors / rules.
2. Fix features.
3. Adjust priors.
4. Adjust weights last.

## 14. Testing Strategy

### 14.1 Detector tests
Input snippets should map to expected categories and source spans.

### 14.2 Ranking fixtures
Use real or realistic note fragments with multiple candidates and assert pairwise ordering rather than brittle exact decimal scores.

Example fixture requirement:
- A causal-gap candidate should rank above an incidental list-structure candidate when the causal sentence is the section’s core claim.

### 14.3 Feedback tests
Verify:
- `什么破问题` changes local ranking immediately.
- Long-term dislike uses smoothing.
- `换一个` does not count as negative feedback.

### 14.4 Suitability tests
Verify speculative / question-heavy notes are not aggressively challenged.

### 14.5 LLM contract tests
Mock provider and verify:
- One question per response.
- Section-first context.
- Whole-note expansion only when requested by orchestration.
- No unsolicited full-answer behavior in prompt contract.

### 14.6 Experience testing
The most important human metric is the rate of:
- `什么破问题`
- `有东西`
- `答不上来`

The goal is not to minimize challenge difficulty; it is to minimize irrelevant or structurally stupid questions.

## 15. MVP Modules

- `ContextExtractor` — current heading section, whole-note fallback.
- `SuitabilityDetector` — exploration score.
- `PatternDetector` — six structural detectors.
- `QuestionGenerator` — template-driven local candidate generation.
- `QuestionRanker` — transparent scoring and ranking.
- `FeedbackStore` — global feedback and note-local suppression.
- `PitRecorder` — writes durable pits to note.
- `LLMProvider` — adapter interface plus OpenAI-compatible implementation.
- `DrillOrchestrator` — one-question-at-a-time follow-up state.
- `CopySystem` — event-driven copy with cooldowns.
- `ChallengeView` — sidebar UI state machine.
- `Commands` — command palette / hotkey trigger.

## 16. MVP Scope Freeze

MVP includes:
- Current section first, whole note fallback.
- Six challenge categories.
- Local generation and transparent scoring.
- Negative/useful/cannot-answer feedback.
- Note-local suppression.
- Durable pit writeback only for useful/cannot-answer.
- Right sidebar + command palette.
- LLM only for continued drilling.
- OpenAI-compatible provider.
- Debug score visibility/logging.
- Event-driven personality copy.
- Suitability refusal for already-unstable notes.

MVP excludes:
- Embeddings.
- RAG.
- Cross-vault semantic search.
- Wikilink neighbor reading.
- Fact checking.
- Reasoning correctness judgments.
- Knowledge-graph weak-point analysis.
- Spaced repetition.
- Background reminders.
- Cloud accounts.
- Automatic aggressive weight learning.
- Multiple first-class provider UIs.

## 17. Success Criteria

A successful MVP should make this loop feel good:

`press → one pointed question → either think, reject, save the pit, or continue drilling`

The plugin succeeds when it reliably exposes “I copied this fluently but cannot actually unpack it” moments without becoming noisy during genuine exploratory thinking.