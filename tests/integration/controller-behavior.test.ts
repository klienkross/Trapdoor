import { describe, expect, it, vi } from "vitest";

import { createChallengeController, type ActiveNoteAdapter } from "../../src/app/challenge-controller";
import type { CopySystem } from "../../src/copy/copy-system";
import type { QuestionCandidate } from "../../src/domain/types";
import { FeedbackStore } from "../../src/feedback/feedback-store";
import type { LLMMessage, LLMProvider } from "../../src/llm/provider";

const settings = { endpoint: "https://example.invalid/v1", model: "test", apiKey: "TOP_SECRET", debug: false };

function makeCandidate(overrides: Partial<QuestionCandidate> = {}): QuestionCandidate {
  return {
    id: "candidate-a",
    category: "causal_gap",
    templateId: "causal-gap-missing-steps",
    question: "“导致”这两个字省掉了哪两步？",
    source: { notePath: "note.md", heading: "机制", from: 5, to: 15, text: "X 导致 Y。", scope: "section" },
    targets: ["X", "Y"],
    triggerTerms: ["导致"],
    followupRoutes: ["mechanism", "evidence"],
    scores: { structure: .8, centrality: .7, diagnosticity: .9, followupability: .95, novelty: 1, repetitionPenalty: 0, dislikePenalty: 0, explorationPenalty: 0, final: .82 },
    ...overrides,
  };
}

function provider(outputs: string[] = []): LLMProvider & { calls: LLMMessage[][] } {
  const calls: LLMMessage[][] = [];
  return {
    calls,
    async complete(messages) {
      calls.push(messages.map((message) => ({ ...message })));
      return outputs.shift() ?? "下一步机制是什么？";
    },
  };
}

function activeNote(markdown: string, cursorOffset = markdown.length): ActiveNoteAdapter & { read(): string } {
  let value = markdown;
  return {
    getActiveNote: () => ({ markdown: value, cursorOffset: Math.min(cursorOffset, value.length), notePath: "note.md" }),
    replaceMarkdown: (next) => { value = next; },
    read: () => value,
  };
}

function silentCopy(): CopySystem {
  return { next: () => null };
}

describe("Task 16 controller behavioral boundaries", () => {
  it("falls back through the real Task 8 pipeline to a whole-note candidate when the current section has none", async () => {
    const markdown = "# 机制\nX 导致 Y。\n\n# 当前\n普通补充文字。";
    const active = activeNote(markdown);
    const fakeProvider = provider();
    const controller = createChallengeController({
      activeNote: active,
      feedbackStore: new FeedbackStore(),
      copySystem: silentCopy(),
      settings,
      provider: fakeProvider,
      persistFeedback: async () => undefined,
      renderState: () => undefined,
    });

    await controller.actions.requestChallenge();

    expect(controller.getState().viewState.kind).toBe("question");
    expect(controller.getState().currentCandidate?.source.scope).toBe("note");
    expect(fakeProvider.calls).toHaveLength(0);
  });

  it("does not write durable note content for shown, replace, bad, continue drill, exit drill, or return idle", async () => {
    const original = "# 机制\nX 导致 Y。";
    const active = activeNote(original);
    const fakeProvider = provider();
    const c = makeCandidate();
    const controller = createChallengeController({
      activeNote: active,
      feedbackStore: new FeedbackStore(),
      copySystem: silentCopy(),
      settings,
      provider: fakeProvider,
      persistFeedback: async () => undefined,
      renderState: () => undefined,
      selectChallenge: () => ({ status: "question", candidate: c }),
    });

    await controller.actions.requestChallenge();
    expect(active.read()).toBe(original);
    await controller.actions.replace();
    expect(active.read()).toBe(original);
    await controller.actions.markBad();
    expect(active.read()).toBe(original);
    await controller.actions.continueDrill();
    expect(active.read()).toBe(original);
    await controller.actions.exitDrill();
    await controller.actions.returnToIdle();
    expect(active.read()).toBe(original);
    expect(fakeProvider.calls).toHaveLength(0);
  });

  it("keeps exactly one provider follow-up per normal answer and preserves conversation order", async () => {
    const fakeProvider = provider(["机制在哪个条件下会失效？"]);
    const controller = createChallengeController({
      activeNote: activeNote("# 机制\nX 导致 Y。"),
      feedbackStore: new FeedbackStore(),
      copySystem: silentCopy(),
      settings,
      provider: fakeProvider,
      persistFeedback: async () => undefined,
      renderState: () => undefined,
      selectChallenge: () => ({ status: "question", candidate: makeCandidate() }),
    });

    await controller.actions.requestChallenge();
    await controller.actions.continueDrill();
    await controller.actions.submitDrillAnswer("因为有一个中间机制。\n");

    expect(fakeProvider.calls).toHaveLength(1);
    const state = controller.getState().viewState;
    expect(state.kind).toBe("drill");
    if (state.kind === "drill") {
      expect(state.turns).toEqual([
        { role: "user", content: "因为有一个中间机制。\n" },
        { role: "assistant", content: "机制在哪个条件下会失效？" },
      ]);
    }
  });

  it("handles no active Markdown note without a provider call", async () => {
    const fakeProvider = provider();
    const controller = createChallengeController({
      activeNote: { getActiveNote: () => null, replaceMarkdown: () => undefined },
      feedbackStore: new FeedbackStore(),
      copySystem: silentCopy(),
      settings,
      provider: fakeProvider,
      persistFeedback: async () => undefined,
      renderState: () => undefined,
    });

    await expect(controller.actions.requestChallenge()).resolves.toBeUndefined();
    expect(controller.getState().viewState.kind).toBe("not_suitable");
    expect(fakeProvider.calls).toHaveLength(0);
  });

  it("keeps debug disabled when settings.debug is false", async () => {
    const controller = createChallengeController({
      activeNote: activeNote("# 机制\nX 导致 Y。"),
      feedbackStore: new FeedbackStore(),
      copySystem: silentCopy(),
      settings,
      provider: provider(),
      persistFeedback: async () => undefined,
      renderState: () => undefined,
      selectChallenge: () => ({ status: "question", candidate: makeCandidate() }),
    });

    await controller.actions.requestChallenge();
    expect(controller.getState().viewState).toMatchObject({ kind: "question", debug: false });
  });

  it("uses bad_question copy unless a streak is explicitly known instead of consuming bad_question_streak", async () => {
    const next = vi.fn((event: Parameters<CopySystem["next"]>[0]) => {
      if (event === "bad_question") return "bad-copy";
      if (event === "bad_question_streak") return "streak-copy";
      return null;
    });
    const controller = createChallengeController({
      activeNote: activeNote("# 机制\nX 导致 Y。"),
      feedbackStore: new FeedbackStore(),
      copySystem: { next },
      settings,
      provider: provider(),
      persistFeedback: async () => undefined,
      renderState: () => undefined,
      selectChallenge: () => ({ status: "question", candidate: makeCandidate() }),
    });

    await controller.actions.requestChallenge();
    await controller.actions.markBad();

    expect(controller.getState().viewState).toMatchObject({ kind: "question", copy: "bad-copy" });
    expect(next).toHaveBeenCalledWith("bad_question");
    expect(next).not.toHaveBeenCalledWith("bad_question_streak");
  });

  it("maps provider failure to safe UI copy without leaking the API key", async () => {
    const failingProvider: LLMProvider = {
      async complete() {
        throw new Error(`upstream rejected ${settings.apiKey}`);
      },
    };
    const controller = createChallengeController({
      activeNote: activeNote("# 机制\nX 导致 Y。"),
      feedbackStore: new FeedbackStore(),
      copySystem: silentCopy(),
      settings,
      provider: failingProvider,
      persistFeedback: async () => undefined,
      renderState: () => undefined,
      selectChallenge: () => ({ status: "question", candidate: makeCandidate() }),
    });

    await controller.actions.requestChallenge();
    await controller.actions.continueDrill();
    await controller.actions.submitDrillAnswer("回答");

    expect(JSON.stringify(controller.getState().viewState)).not.toContain(settings.apiKey);
  });

  it.each(["markUseful", "markCannotAnswer"] as const)("does not persist %s feedback or write a pit after switching from candidate note A to active note B", async (action) => {
    let active = { markdown: "# A\nX 导致 Y。", cursorOffset: 5, notePath: "A.md" };
    const adapter: ActiveNoteAdapter = {
      getActiveNote: () => active,
      replaceMarkdown: (markdown) => { active = { ...active, markdown }; },
    };
    const candidate = makeCandidate({
      source: { notePath: "A.md", heading: "A", from: 0, to: active.markdown.length, text: active.markdown, scope: "section" },
    });
    const feedbackStore = new FeedbackStore();
    const persistFeedback = vi.fn(async () => undefined);
    const controller = createChallengeController({
      activeNote: adapter,
      feedbackStore,
      copySystem: silentCopy(),
      settings,
      provider: provider(),
      persistFeedback,
      renderState: () => undefined,
      selectChallenge: () => ({ status: "question", candidate }),
    });

    await controller.actions.requestChallenge();
    persistFeedback.mockClear();
    active = { markdown: "# B\n这里是 B。", cursorOffset: 5, notePath: "B.md" };

    await controller.actions[action]();

    expect(active.markdown).toBe("# B\n这里是 B。");
    expect(active.markdown).not.toContain("认知坑");
    const forbiddenAction = action === "markUseful" ? "useful" : "cannot_answer";
    expect(feedbackStore.getRecentHistory().some((entry) => entry.action === forbiddenAction)).toBe(false);
    expect(persistFeedback).not.toHaveBeenCalled();
  });

  it("does not start a drill with candidate A and active note B context after switching notes", async () => {
    let active = { markdown: "# A\nX 导致 Y。", cursorOffset: 5, notePath: "A.md" };
    const adapter: ActiveNoteAdapter = {
      getActiveNote: () => active,
      replaceMarkdown: (markdown) => { active = { ...active, markdown }; },
    };
    const candidate = makeCandidate({
      source: { notePath: "A.md", heading: "A", from: 0, to: active.markdown.length, text: active.markdown, scope: "section" },
    });
    const fakeProvider = provider();
    const controller = createChallengeController({
      activeNote: adapter,
      feedbackStore: new FeedbackStore(),
      copySystem: silentCopy(),
      settings,
      provider: fakeProvider,
      persistFeedback: async () => undefined,
      renderState: () => undefined,
      selectChallenge: () => ({ status: "question", candidate }),
    });

    await controller.actions.requestChallenge();
    active = { markdown: "# B\nB 的上下文。", cursorOffset: 5, notePath: "B.md" };

    await controller.actions.continueDrill();

    expect(controller.getState().viewState.kind).toBe("question");
    expect(controller.getState().drillState).toBeUndefined();
    expect(fakeProvider.calls).toHaveLength(0);
  });
});
