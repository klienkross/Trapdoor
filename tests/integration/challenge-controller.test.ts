import { describe, expect, it, vi } from "vitest";

import { createChallengeController, type ActiveNoteAdapter } from "../../src/app/challenge-controller";
import { createCopySystem } from "../../src/copy/copy-system";
import type { QuestionCandidate } from "../../src/domain/types";
import { FeedbackStore } from "../../src/feedback/feedback-store";
import type { LLMMessage, LLMProvider } from "../../src/llm/provider";
import type { ChallengeViewState } from "../../src/ui/challenge-view-renderer";

const settings = { endpoint: "https://example.invalid/v1", model: "test", apiKey: "SECRET_KEY", debug: false };

function makeActive(markdown: string, cursorOffset = markdown.length, notePath = "note.md") {
  let current = markdown;
  const adapter: ActiveNoteAdapter = {
    getActiveNote: () => ({ markdown: current, cursorOffset: Math.min(cursorOffset, current.length), notePath }),
    replaceMarkdown: (next) => { current = next; },
  };
  return { adapter, get markdown() { return current; }, edit(next: string) { current = next; } };
}

function makeProvider(outputs: string[] = []): LLMProvider & { calls: LLMMessage[][] } {
  const calls: LLMMessage[][] = [];
  return {
    calls,
    async complete(messages) {
      calls.push(messages.map((message) => ({ ...message })));
      return outputs.shift() ?? "下一步机制是什么？";
    },
  };
}

function candidate(scope: "section" | "note" = "section"): QuestionCandidate {
  return {
    id: `candidate-${scope}`,
    category: "causal_gap",
    templateId: "causal-gap-missing-steps",
    question: "“导致”这两个字省掉了哪两步？",
    source: { notePath: "note.md", heading: scope === "section" ? "机制" : null, from: 0, to: 14, text: "X 导致 Y。", scope },
    targets: ["X", "Y"], triggerTerms: ["导致"], followupRoutes: ["mechanism", "evidence"],
    scores: { structure: .8, centrality: .7, diagnosticity: .9, followupability: .95, novelty: 1, repetitionPenalty: 0, dislikePenalty: 0, explorationPenalty: 0, final: .82 },
  };
}

function harness(markdown: string, provider = makeProvider(), overrides: Record<string, unknown> = {}) {
  const active = makeActive(markdown);
  const feedbackStore = new FeedbackStore();
  const states: ChallengeViewState[] = [];
  const persistFeedback = vi.fn(async () => undefined);
  const controller = createChallengeController({
    activeNote: active.adapter,
    feedbackStore,
    copySystem: createCopySystem({ now: () => 1_000 }),
    settings,
    provider,
    persistFeedback,
    renderState: (state) => states.push(state),
    now: () => 1_000,
    ...overrides,
  });
  return { active, feedbackStore, states, persistFeedback, provider, controller };
}

describe("Task 16 end-to-end controller", () => {
  it("uses the real local Task 8 path for the first section challenge with zero provider calls", async () => {
    const h = harness("# 机制\n缓存命中率提高导致请求延迟降低。\n");
    await h.controller.actions.requestChallenge();
    expect(h.controller.getState().viewState.kind).toBe("question");
    expect(h.controller.getState().currentCandidate?.source.scope).toBe("section");
    expect(h.provider.calls).toHaveLength(0);
    expect(h.feedbackStore.getRecentShownHistory()).toHaveLength(1);
  });

  it("renders not_suitable for an already exploratory section without touching the provider", async () => {
    const h = harness("# 草稿\nTODO：可能是 A？也许是 B？不确定，还需要验证？另一个解释？\n");
    await h.controller.actions.requestChallenge();
    expect(h.controller.getState().viewState.kind).toBe("not_suitable");
    expect(h.provider.calls).toHaveLength(0);
  });

  it("records replace separately from bad and never calls the provider", async () => {
    const first = candidate();
    const second = { ...candidate(), id: "candidate-2", templateId: "causal-gap-chain", question: "中间机制断在哪一步？" };
    let calls = 0;
    const h = harness("# 机制\nX 导致 Y。", makeProvider(), {
      selectChallenge: () => ({ status: "question", candidate: calls++ === 0 ? first : second }),
    });
    await h.controller.actions.requestChallenge();
    await h.controller.actions.replace();
    expect(h.feedbackStore.getTemplateStats(first.templateId).bad).toBe(0);
    expect(h.feedbackStore.getRecentHistory().some((entry) => entry.action === "replace")).toBe(true);
    expect(h.controller.getState().currentCandidate?.id).toBe(second.id);
    expect(h.provider.calls).toHaveLength(0);
  });

  it("bad feedback suppresses the rejected question locally and replaces without LLM", async () => {
    const first = candidate();
    const second = { ...candidate(), id: "candidate-2", category: "evidence_jump" as const, templateId: "evidence-jump-fact", question: "哪个事实最能支撑它？" };
    let calls = 0;
    const h = harness("# 机制\nX 导致 Y。", makeProvider(), { selectChallenge: () => ({ status: "question", candidate: calls++ === 0 ? first : second }) });
    await h.controller.actions.requestChallenge();
    await h.controller.actions.markBad();
    expect(h.feedbackStore.getTemplateStats(first.templateId).bad).toBe(1);
    expect(h.feedbackStore.isSuppressedForNote("note.md", first)).toBe(true);
    expect(h.controller.getState().currentCandidate?.id).toBe(second.id);
    expect(h.provider.calls).toHaveLength(0);
  });

  it("useful writes a pit into the freshest markdown and cannot-answer is not bad", async () => {
    const whole = candidate("note");
    const h = harness("X 导致 Y。", makeProvider(), { selectChallenge: () => ({ status: "question", candidate: whole }) });
    await h.controller.actions.requestChallenge();
    h.active.edit("X 导致 Y。\n后来新增的一段。");
    await h.controller.actions.markUseful();
    expect(h.active.markdown).toContain("> [!question] 认知坑");
    expect(h.active.markdown).toContain(whole.question);
    expect(h.active.markdown.indexOf("后来新增的一段。")).toBeLessThan(h.active.markdown.indexOf("认知坑"));
    expect(h.controller.getState().viewState.kind).toBe("pit_saved");

    const h2 = harness("X 导致 Y。", makeProvider(), { selectChallenge: () => ({ status: "question", candidate: whole }) });
    await h2.controller.actions.requestChallenge();
    await h2.controller.actions.markCannotAnswer();
    expect(h2.active.markdown).toContain("认知坑");
    expect(h2.feedbackStore.getTemplateStats(whole.templateId).bad).toBe(0);
  });

  it("crosses the network boundary only after drill answer, handles one escalation, and keeps sentinels out of view state", async () => {
    const provider = makeProvider(["[[NEED_WHOLE_NOTE]]", "你能指出这个机制的边界吗？", "还有哪个反例会推翻它？"]);
    const c = candidate();
    const h = harness("# 附录\nwhole-note secret\n\n# 机制\nX 导致 Y。", provider, { selectChallenge: () => ({ status: "question", candidate: c }) });
    await h.controller.actions.requestChallenge();
    await h.controller.actions.continueDrill();
    expect(provider.calls).toHaveLength(0);
    await h.controller.actions.submitDrillAnswer("因为中间有缓存。\n");
    expect(provider.calls).toHaveLength(2);
    expect(provider.calls[0]!.some((m) => m.content.includes("whole-note secret"))).toBe(false);
    expect(provider.calls[1]!.some((m) => m.content.includes("whole-note secret"))).toBe(true);
    expect(JSON.stringify(h.controller.getState().viewState)).not.toContain("[[NEED_WHOLE_NOTE]]");
    await h.controller.actions.submitDrillAnswer("边界是缓存失效。\n");
    expect(provider.calls).toHaveLength(3);
    expect(provider.calls[2]!.some((m) => m.content.includes("whole-note secret"))).toBe(true);
  });

  it("renders exhausted drill copy without exposing the sentinel or allowing another submit", async () => {
    const provider = makeProvider(["[[DRILL_EXHAUSTED]]"]);
    const h = harness("# 机制\nX 导致 Y。", provider, { selectChallenge: () => ({ status: "question", candidate: candidate() }) });
    await h.controller.actions.requestChallenge();
    await h.controller.actions.continueDrill();
    await h.controller.actions.submitDrillAnswer("已经解释完了。\n");
    const state = h.controller.getState().viewState;
    expect(state.kind).toBe("drill");
    expect(JSON.stringify(state)).not.toContain("[[DRILL_EXHAUSTED]]");
    if (state.kind === "drill") expect(state.exhaustedCopy).toBeTruthy();
    await h.controller.actions.submitDrillAnswer("不该再发。\n");
    expect(provider.calls).toHaveLength(1);
  });

  it("uses settings.debug only for question debug visibility and never exposes the api key", async () => {
    const h = harness("# 机制\nX 导致 Y。", makeProvider(), { selectChallenge: () => ({ status: "question", candidate: candidate() }), settings: { ...settings, debug: true } });
    await h.controller.actions.requestChallenge();
    expect(h.controller.getState().viewState).toMatchObject({ kind: "question", debug: true });
    expect(JSON.stringify(h.controller.getState())).not.toContain(settings.apiKey);
    expect(JSON.stringify(h.feedbackStore.exportState())).not.toContain(settings.apiKey);
  });
});
