import { describe, expect, it, vi } from "vitest";

import { createChallengeController, type ActiveNoteAdapter } from "../../src/app/challenge-controller";
import { createCopySystem } from "../../src/copy/copy-system";
import type { QuestionCandidate } from "../../src/domain/types";
import { FeedbackStore } from "../../src/feedback/feedback-store";
import type { LLMMessage, LLMProvider } from "../../src/llm/provider";
import type { ChallengeViewState } from "../../src/ui/challenge-view-renderer";

const settings = { endpoint: "https://example.invalid/v1", model: "test", apiKey: "SECRET_KEY", debug: false };

function candidate(): QuestionCandidate {
  return {
    id: "candidate-a",
    category: "causal_gap",
    templateId: "causal-gap-missing-steps",
    question: "“导致”这两个字省掉了哪两步？",
    source: { notePath: "note.md", heading: "机制", from: 0, to: 14, text: "X 导致 Y。", scope: "section" },
    targets: ["X", "Y"],
    triggerTerms: ["导致"],
    followupRoutes: ["mechanism", "evidence"],
    scores: { structure: .8, centrality: .7, diagnosticity: .9, followupability: .95, novelty: 1, repetitionPenalty: 0, dislikePenalty: 0, explorationPenalty: 0, final: .82 },
  };
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

function harness(options: {
  selectChallenge: () => { status: "none" } | { status: "question"; candidate: QuestionCandidate };
  provider?: LLMProvider & { calls: LLMMessage[][] };
  providerReady?: () => boolean;
}) {
  let markdown = "# 机制\nX 导致 Y。\n";
  const activeNote: ActiveNoteAdapter = {
    getActiveNote: () => ({ markdown, cursorOffset: markdown.length, notePath: "note.md" }),
    replaceMarkdown: (next) => { markdown = next; },
  };
  const feedbackStore = new FeedbackStore();
  const provider = options.provider ?? makeProvider();
  const states: ChallengeViewState[] = [];
  const persistFeedback = vi.fn(async () => undefined);
  const controller = createChallengeController({
    activeNote,
    feedbackStore,
    copySystem: createCopySystem({ now: () => 1_000 }),
    settings,
    provider,
    persistFeedback,
    renderState: (state) => states.push(state),
    now: () => 1_000,
    selectChallenge: options.selectChallenge,
    providerReady: options.providerReady,
  });
  return { controller, feedbackStore, provider, states, persistFeedback };
}

describe("sidebar controller UX polish", () => {
  it("acknowledges a normal none result without provider or feedback effects", async () => {
    const h = harness({ selectChallenge: () => ({ status: "none" }) });

    await h.controller.actions.requestChallenge();

    const state = h.controller.getState().viewState;
    expect(state.kind).toBe("idle");
    if (state.kind === "idle") expect(state.copy).toBeTruthy();
    expect(h.provider.calls).toHaveLength(0);
    expect(h.feedbackStore.getRecentHistory()).toHaveLength(0);
    expect(h.persistFeedback).not.toHaveBeenCalled();
  });

  it("keeps the old empty-draft start flow without sending an answer", async () => {
    const provider = makeProvider();
    const h = harness({ selectChallenge: () => ({ status: "question", candidate: candidate() }), provider });
    await h.controller.actions.requestChallenge();

    await h.controller.actions.continueDrill(undefined);

    expect(h.controller.getState().viewState.kind).toBe("drill");
    expect(provider.calls).toHaveLength(0);
  });

  it("uses a non-empty draft as the first real drill answer", async () => {
    const provider = makeProvider(["下一轮追问是什么？"]);
    const h = harness({ selectChallenge: () => ({ status: "question", candidate: candidate() }), provider });
    await h.controller.actions.requestChallenge();

    await h.controller.actions.continueDrill("我觉得这里的关键是……");

    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]!.some((message) => message.role === "user" && message.content === "我觉得这里的关键是……")).toBe(true);
    expect(h.controller.getState().viewState.kind).toBe("drill");
  });

  it("does not submit a draft when the provider is not ready and stays on the question", async () => {
    const provider = makeProvider();
    const h = harness({
      selectChallenge: () => ({ status: "question", candidate: candidate() }),
      provider,
      providerReady: () => false,
    });
    await h.controller.actions.requestChallenge();

    await h.controller.actions.continueDrill("我的答案");

    expect(provider.calls).toHaveLength(0);
    const state = h.controller.getState().viewState;
    expect(state.kind).toBe("question");
    if (state.kind === "question") expect(state.copy).toBe("先配置 endpoint 和 model 再继续拷打。");
  });
});
