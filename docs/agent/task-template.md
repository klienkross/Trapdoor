# Trapdoor Worker Handoff Template

Use this for normal coding-worker handoffs. The prompt should describe the current assignment and point to durable repo state rather than replaying project history.

## Bounded prompt template

```text
你是 Trapdoor 的 <task name> worker。

基线：最新 <branch>。

先读取：
- docs/agent/project-contract.md
- docs/agent/architecture-map.md
- <task-specific spec/source/tests only>

本轮只修 / 只实现：
- <current task>

已确认 reproduction / task-local context：
- <only facts needed to reproduce this task>

Acceptance：
- <task-specific acceptance criteria>

不要做：
- <explicit adjacent scope exclusions>
```

Do not append project history, old CI evidence, stable module invariants, or prose versions of regression tests unless they are genuinely necessary to define this task.

## Startup

The worker follows the startup protocol in `project-contract.md`: inspect branch/HEAD → read canonical contracts → read task-specific material → inspect owning source/tests → verify baseline → RED → implement → verify.

A handoff should name task-specific files when that materially narrows recovery, but it should not paste their contents merely to save the worker from reading them.

## Completion

Default report:

```text
branch
RED commit
final commit
changed files
behavioral/infrastructure change
verification result
known remaining limitation
```

Omit fields that genuinely do not apply. Do not add a long inventory of untouched modules.

## Prompt budget

- bounded bugfix: ≤ 1,500 words;
- complex feature: ≤ 2,500 words.

If the task exceeds its budget, explain which task-local information cannot be replaced by repo docs, source, tests, Git, or CI. Do not solve the problem by blind truncation.

## Local helper

The repo-local helper reads canonical paths and budgets from `docs/agent/project-state.json`:

```bash
npm run agent:handoff -- render path/to/task.json
npm run agent:handoff -- check path/to/prompt.txt bugfix
npm run agent:handoff -- check path/to/prompt.txt feature
```

`render` accepts task-local JSON fields such as `worker`, `base`, `task`, `read`, `context`, `acceptance`, `forbid`, and `report`. It emits a bounded prompt and refuses output that fails the configured mechanical checks. `check` reports obvious prompt bloat such as budget overflow, repeated task-to-SHA history, multiple full SHAs, or copied Actions run IDs. It does not truncate or semantically summarize prompts.

## Migration example — sidebar UX polish

The following **before** is an exact excerpt from a recent sidebar UX polish handoff. It demonstrates the old pattern: baseline SHA/history context, stable TDD instruction, renderer structure, and UI inventory were carried in the assignment itself.

### Before

```text
你是 Trapdoor 的 sidebar UX polish worker。

仓库：`klienkross/Trapdoor`
基线分支：最新 `feat/trapdoor-mvp`
当前已知 merge baseline：`a49d5efcd8d24fd99a25215bae9f444619f3623f`

本轮只做三个 bounded UI/interaction 改进：

1. `status === "none"` 时必须有可见反馈
2. question 状态支持复制问题
3. question 状态增加临时草稿框；有草稿时点「继续拷打」直接把草稿作为第一轮 answer

不要修 detector、target quality、原文高亮/source navigation、LLM preprocessing、ranker 或其他 smoke findings。

严格 TDD。先 RED，确认失败原因正确，再写 production code。

现有结构：

QuestionViewState = {
  kind: "question";
  candidate: QuestionCandidate;
  copy?: string;
  debug: boolean;
}

question UI 当前有：
来源
问题
继续拷打
有东西
答不上来
什么破问题
```

Approximate word count: **77** word-like segments.

### After

```text
你是 Trapdoor 的 sidebar UX polish worker。

基线：最新 `main`。
读取 `docs/agent/project-contract.md`、`docs/agent/architecture-map.md`，再检查 `src/ui/` 与对应测试。

只修：
1. none 状态给出可见反馈；
2. question 可复制问题正文；
3. question 增加临时草稿，有草稿时「继续拷打」直接作为第一轮 answer。

Acceptance：
- 草稿不持久化；
- 复制只包含问题正文。

不要改 detector、source navigation、LLM preprocessing、ranker 或其他 smoke findings。
```

Approximate word count: **45** word-like segments.

For this Chinese/English mixed example, the count treats each contiguous Han run or Latin/code token as one word-like segment. The metric is intentionally simple and reproducible; its purpose is comparative, not linguistic.

### What moved out of the prompt

- strict RED → GREEN and verification rules → `project-contract.md`;
- module boundaries / where sidebar ownership lives → `architecture-map.md` + source tree;
- renderer types and current controls → current source/tests;
- old merge SHA → Git history;
- old green/failure evidence → CI for the current HEAD;
- stable regressions → regression tests.

The after prompt still carries what only the assignment can know: the three requested changes, task-specific acceptance criteria, adjacent scope exclusions, and the current base branch.
