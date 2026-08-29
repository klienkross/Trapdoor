import { describe, expect, it } from "vitest";
import type { ChallengeCategory, QuestionCandidate } from "../../src/domain/types";
import {
  FeedbackStore,
  type FeedbackStoreState,
} from "../../src/feedback/feedback-store";

function candidate(
  id: string,
  notePath = "notes/a.md",
  category: ChallengeCategory = "causal_gap",
  templateId = "causal-gap-01",
): QuestionCandidate {
  return {
    id,
    category,
    templateId,
    question: `question ${id}`,
    source: {
      notePath,
      heading: null,
      from: 0,
      to: 10,
      text: `source ${id}`,
      scope: "section",
    },
    targets: [id],
    triggerTerms: ["导致"],
    scores: {
      structure: 0.8,
      centrality: 0.4,
      diagnosticity: 0.9,
      followupability: 0.95,
      novelty: 1,
      repetitionPenalty: 0,
      dislikePenalty: 0,
      explorationPenalty: 0,
      final: 0.8,
    },
    followupRoutes: ["mechanism"],
  };
}

describe("FeedbackStore serialization boundary", () => {
  it("round-trips an empty store", () => {
    const restored = FeedbackStore.fromState(new FeedbackStore().exportState());

    expect(restored.exportState()).toEqual({
      templates: {},
      categories: {},
      recentHistory: [],
      recentShownHistory: [],
    });
  });

  it("round-trips template/category counters and both bounded histories", () => {
    const store = new FeedbackStore();
    const first = candidate("one");
    const second = candidate("two", "notes/a.md", "evidence_jump", "evidence-jump-01");

    store.recordShown(first, 10);
    store.recordFeedback(first, "bad", 20);
    store.recordShown(second, 30);
    store.recordFeedback(second, "replace", 40);

    const restored = FeedbackStore.fromState(store.exportState());

    expect(restored.getTemplateStats(first.templateId)).toEqual(store.getTemplateStats(first.templateId));
    expect(restored.getCategoryStats(first.category)).toEqual(store.getCategoryStats(first.category));
    expect(restored.getRecentHistory()).toEqual(store.getRecentHistory());
    expect(restored.getRecentShownHistory()).toEqual(store.getRecentShownHistory());
  });

  it("recomputes badRate instead of serializing it", () => {
    const store = new FeedbackStore();
    const value = candidate("one");
    for (let i = 0; i < 6; i += 1) store.recordShown(value, i);
    store.recordFeedback(value, "bad", 10);
    store.recordFeedback(value, "bad", 11);

    const state = store.exportState();
    expect(state.templates[value.templateId]).toEqual({ shown: 6, bad: 2 });

    const restored = FeedbackStore.fromState(state);
    expect(restored.getTemplateStats(value.templateId).badRate).toBe((2 + 1) / (6 + 4));
  });

  it("derives note-local suppression only from restored recent bad history", () => {
    const store = new FeedbackStore({ recentLimit: 2 });
    const rejected = candidate("rejected");
    store.recordFeedback(rejected, "bad", 10);
    store.recordShown(candidate("other", "notes/a.md", "evidence_jump", "evidence-jump-01"), 20);

    const restored = FeedbackStore.fromState(store.exportState(), { recentLimit: 2 });
    expect(restored.isSuppressedForNote("notes/a.md", rejected)).toBe(true);

    restored.recordFeedback(candidate("third", "notes/a.md", "definition_boundary", "definition-boundary-01"), "replace", 30);
    expect(restored.isSuppressedForNote("notes/a.md", rejected)).toBe(false);
  });

  it("preserves a separate last-10 shown window even when mixed feedback events are present", () => {
    const store = new FeedbackStore({ recentLimit: 10 });
    for (let i = 0; i < 10; i += 1) {
      const value = candidate(`shown-${i}`);
      store.recordShown(value, i * 2);
      store.recordFeedback(value, "replace", i * 2 + 1);
    }

    const restored = FeedbackStore.fromState(store.exportState());
    expect(restored.getRecentHistory()).toHaveLength(10);
    expect(restored.getRecentShownHistory()).toHaveLength(10);
    expect(restored.getRecentShownHistory().map((entry) => entry.candidateId)).toEqual(
      Array.from({ length: 10 }, (_, index) => `shown-${index}`),
    );
  });

  it("clones exported and restored state instead of retaining mutable references", () => {
    const store = new FeedbackStore();
    store.recordShown(candidate("one"), 10);
    const state = store.exportState();
    const restored = FeedbackStore.fromState(state);

    state.templates["causal-gap-01"].shown = 999;
    state.recentHistory[0].targets[0] = "mutated";

    expect(restored.getTemplateStats("causal-gap-01").shown).toBe(1);
    expect(restored.getRecentHistory()[0].targets).toEqual(["one"]);
  });

  it("truncates overlong restored histories to the current limits", () => {
    const history = Array.from({ length: 15 }, (_, index) => ({
      candidateId: `c-${index}`,
      notePath: "notes/a.md",
      category: "causal_gap" as const,
      templateId: "causal-gap-01",
      sourceFrom: index,
      sourceTo: index + 1,
      targets: [`t-${index}`],
      action: "shown" as const,
      timestamp: index,
    }));
    const state: FeedbackStoreState = {
      templates: {},
      categories: {},
      recentHistory: history,
      recentShownHistory: history,
    };

    const restored = FeedbackStore.fromState(state, { recentLimit: 3, recentShownLimit: 10 });

    expect(restored.getRecentHistory().map((entry) => entry.candidateId)).toEqual(["c-12", "c-13", "c-14"]);
    expect(restored.getRecentShownHistory().map((entry) => entry.candidateId)).toEqual(
      Array.from({ length: 10 }, (_, index) => `c-${index + 5}`),
    );
  });
});
