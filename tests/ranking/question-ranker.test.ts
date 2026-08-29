import { describe, expect, it } from "vitest";
import type { ChallengeCategory, QuestionCandidate } from "../../src/domain/types";
import { FeedbackStore } from "../../src/feedback/feedback-store";
import { rankCandidates } from "../../src/ranking/question-ranker";

function candidate(overrides: Partial<QuestionCandidate> = {}): QuestionCandidate {
  const base: QuestionCandidate = {
    id: "candidate-a",
    category: "causal_gap",
    templateId: "causal-gap-01",
    question: "机制中间缺了哪一步？",
    source: {
      notePath: "notes/a.md",
      heading: null,
      from: 0,
      to: 12,
      text: "一个孤立陈述。",
      scope: "section",
    },
    targets: ["核心概念"],
    triggerTerms: ["导致"],
    scores: {
      structure: 0.8,
      centrality: 0,
      diagnosticity: 0.9,
      followupability: 0.95,
      novelty: 0,
      repetitionPenalty: 0,
      dislikePenalty: 0,
      explorationPenalty: 0,
      final: 0,
    },
    followupRoutes: ["mechanism"],
  };

  return {
    ...base,
    ...overrides,
    source: { ...base.source, ...overrides.source },
    scores: { ...base.scores, ...overrides.scores },
    targets: overrides.targets ? [...overrides.targets] : [...base.targets],
    triggerTerms: overrides.triggerTerms ? [...overrides.triggerTerms] : [...base.triggerTerms],
    followupRoutes: overrides.followupRoutes ? [...overrides.followupRoutes] : [...base.followupRoutes],
  };
}

function variant(
  id: string,
  category: ChallengeCategory,
  templateId: string,
  overrides: Partial<QuestionCandidate> = {},
): QuestionCandidate {
  return candidate({ id, category, templateId, ...overrides });
}

describe("rankCandidates", () => {
  it("uses the published positive formula exactly when there are no penalties", () => {
    const value = candidate({
      scores: {
        structure: 0.8,
        diagnosticity: 0.6,
        followupability: 0.4,
      } as QuestionCandidate["scores"],
    });

    const [ranked] = rankCandidates([value], { explorationScore: 0 });
    const expected = 0.8 * 0.25 + 0 * 0.2 + 0.6 * 0.25 + 0.4 * 0.15 + 1 * 0.15;

    expect(ranked.scores.final).toBeCloseTo(expected, 10);
  });

  it("ranks higher-structure and higher-diagnosticity candidates above weaker peers", () => {
    const strong = candidate({ id: "strong", scores: { structure: 0.95, diagnosticity: 0.95 } as QuestionCandidate["scores"] });
    const weak = candidate({ id: "weak", scores: { structure: 0.45, diagnosticity: 0.55 } as QuestionCandidate["scores"] });

    expect(rankCandidates([weak, strong]).map((item) => item.id)).toEqual(["strong", "weak"]);
  });

  it("raises centrality for transparent source-position and content signals", () => {
    const low = candidate({ id: "low-centrality" });
    const high = candidate({
      id: "high-centrality",
      source: {
        notePath: "notes/a.md",
        heading: "注意力机制",
        from: 0,
        to: 80,
        text: "## 注意力机制\n\n**注意力**导致筛选。注意力也影响后续加工。",
        scope: "section",
      },
      targets: ["注意力"],
      triggerTerms: ["导致"],
    });

    const ranked = rankCandidates([low, high]);

    expect(ranked.find((item) => item.id === "high-centrality")!.scores.centrality).toBeGreaterThan(
      ranked.find((item) => item.id === "low-centrality")!.scores.centrality,
    );
  });

  it("lowers novelty as the shown frequency of the category rises", () => {
    const store = new FeedbackStore({ recentLimit: 20 });
    const target = candidate({ id: "target" });
    store.recordShown(candidate({ id: "old-1" }), 1);
    store.recordShown(candidate({ id: "old-2" }), 2);
    store.recordShown(variant("old-3", "evidence_jump", "evidence-jump-01"), 3);
    store.recordShown(variant("old-4", "definition_boundary", "definition-boundary-01"), 4);

    const [ranked] = rankCandidates([target], { feedbackStore: store });

    expect(ranked.scores.novelty).toBeCloseTo(0.5, 10);
  });

  it("does not count feedback entries as additional shown questions for novelty", () => {
    const store = new FeedbackStore({ recentLimit: 20 });
    const shown = candidate({ id: "shown-once" });
    const target = candidate({ id: "target", source: { ...shown.source, from: 100, to: 120 } });
    store.recordShown(shown, 1);
    store.recordFeedback(shown, "bad", 2);
    store.recordFeedback(shown, "replace", 3);
    store.recordShown(variant("other", "evidence_jump", "evidence-jump-01"), 4);

    const [ranked] = rankCandidates([target], { feedbackStore: store });

    expect(ranked.scores.novelty).toBeCloseTo(0.5, 10);
  });

  it("applies the published large repetition penalty for same source and category", () => {
    const store = new FeedbackStore({ recentLimit: 20 });
    const shown = candidate({ id: "shown", templateId: "causal-gap-02", targets: ["别的概念"] });
    store.recordShown(shown, 1);

    const [ranked] = rankCandidates([candidate({ id: "target" })], { feedbackStore: store });

    expect(ranked.scores.repetitionPenalty).toBeCloseTo(0.8, 10);
  });

  it("applies the published moderate repetition penalty for same source and different category", () => {
    const store = new FeedbackStore({ recentLimit: 20 });
    store.recordShown(variant("shown", "evidence_jump", "evidence-jump-01", { targets: ["证据"] }), 1);

    const [ranked] = rankCandidates([candidate({ id: "target" })], { feedbackStore: store });

    expect(ranked.scores.repetitionPenalty).toBeCloseTo(0.3, 10);
  });

  it("applies a large repetition penalty for the same template and deterministic target concepts", () => {
    const store = new FeedbackStore({ recentLimit: 20 });
    const shown = candidate({
      id: "shown",
      source: { ...candidate().source, from: 100, to: 120 },
      targets: ["A", "B"],
    });
    store.recordShown(shown, 1);

    const [ranked] = rankCandidates([
      candidate({ id: "target", source: { ...candidate().source, from: 200, to: 220 }, targets: ["B", "A"] }),
    ], { feedbackStore: store });

    expect(ranked.scores.repetitionPenalty).toBeGreaterThanOrEqual(0.8);
  });

  it("uses long-term bad rate as a small penalty without permanently banning the category", () => {
    const store = new FeedbackStore({ recentLimit: 2 });
    const historicallyBad = candidate({ id: "historically-bad" });
    store.recordShown(historicallyBad, 1);
    store.recordFeedback(historicallyBad, "bad", 2);
    store.recordShown(variant("evict-1", "evidence_jump", "evidence-jump-01"), 3);
    store.recordShown(variant("evict-2", "definition_boundary", "definition-boundary-01"), 4);

    const strong = candidate({ id: "strong", source: { ...candidate().source, from: 100, to: 120 } });
    const weak = variant("weak", "list_structure", "list-structure-01", {
      source: { ...candidate().source, from: 200, to: 220 },
      scores: { structure: 0.3, diagnosticity: 0.3, followupability: 0.3 } as QuestionCandidate["scores"],
    });
    const ranked = rankCandidates([weak, strong], { feedbackStore: store });

    expect(ranked.find((item) => item.id === "strong")!.scores.dislikePenalty).toBeGreaterThan(0);
    expect(ranked.map((item) => item.id)[0]).toBe("strong");
  });

  it("makes note-local recent bad feedback stronger than long-term dislike", () => {
    const store = new FeedbackStore({ recentLimit: 20 });
    const rejected = candidate({ id: "rejected" });
    store.recordShown(rejected, 1);
    store.recordFeedback(rejected, "bad", 2);

    const [ranked] = rankCandidates([candidate({ id: "alternative-same-template" })], { feedbackStore: store });
    const longTermOnlyStore = new FeedbackStore({ recentLimit: 1 });
    longTermOnlyStore.recordShown(rejected, 1);
    longTermOnlyStore.recordFeedback(rejected, "bad", 2);
    longTermOnlyStore.recordShown(variant("evict", "evidence_jump", "evidence-jump-01"), 3);
    const [longTermOnly] = rankCandidates([
      candidate({ id: "alternative-same-template", source: { ...candidate().source, from: 100, to: 120 } }),
    ], { feedbackStore: longTermOnlyStore });

    expect(ranked.scores.dislikePenalty).toBeGreaterThan(longTermOnly.scores.dislikePenalty);
  });

  it("drops short-term dislike after Task 6 recent suppression evicts the bad entry", () => {
    const store = new FeedbackStore({ recentLimit: 2 });
    const rejected = candidate({ id: "rejected" });
    store.recordFeedback(rejected, "bad", 1);
    const [during] = rankCandidates([candidate({ id: "target", source: { ...candidate().source, from: 100, to: 120 } })], { feedbackStore: store });

    store.recordShown(variant("evict-1", "evidence_jump", "evidence-jump-01"), 2);
    store.recordShown(variant("evict-2", "definition_boundary", "definition-boundary-01"), 3);
    const [after] = rankCandidates([candidate({ id: "target", source: { ...candidate().source, from: 100, to: 120 } })], { feedbackStore: store });

    expect(during.scores.dislikePenalty).toBeGreaterThan(after.scores.dislikePenalty);
  });

  it("makes exploration penalty monotonic in explorationScore", () => {
    const value = candidate();
    const penalties = [0, 0.25, 0.5, 1].map((explorationScore) =>
      rankCandidates([value], { explorationScore })[0].scores.explorationPenalty,
    );

    expect(penalties).toEqual([...penalties].sort((a, b) => a - b));
  });

  it("returns final scores in descending order", () => {
    const values = [
      candidate({ id: "middle", scores: { structure: 0.6 } as QuestionCandidate["scores"] }),
      candidate({ id: "low", scores: { structure: 0.2 } as QuestionCandidate["scores"] }),
      candidate({ id: "high", scores: { structure: 1 } as QuestionCandidate["scores"] }),
    ];

    const ranked = rankCandidates(values);

    expect(ranked.map((item) => item.scores.final)).toEqual(
      [...ranked.map((item) => item.scores.final)].sort((a, b) => b - a),
    );
  });

  it("uses candidate id as a deterministic tie-break", () => {
    const b = candidate({ id: "b" });
    const a = candidate({ id: "a" });

    expect(rankCandidates([b, a]).map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("does not mutate original candidate scores", () => {
    const value = candidate();
    const before = structuredClone(value);

    rankCandidates([value], { explorationScore: 0.7 });

    expect(value).toEqual(before);
  });

  it("returns an empty array for empty input", () => {
    expect(rankCandidates([])).toEqual([]);
  });

  it("pairwise: a fresh diagnostic question beats a recently repeated question", () => {
    const store = new FeedbackStore({ recentLimit: 20 });
    const repeated = candidate({ id: "repeated", source: { ...candidate().source, from: 0, to: 12 } });
    store.recordShown(repeated, 1);
    const fresh = variant("fresh", "evidence_jump", "evidence-jump-01", {
      source: { ...candidate().source, from: 100, to: 120 },
      scores: { structure: 0.85, diagnosticity: 0.9, followupability: 0.9 } as QuestionCandidate["scores"],
    });

    expect(rankCandidates([repeated, fresh], { feedbackStore: store })[0].id).toBe("fresh");
  });

  it("pairwise: same category on a fresh source beats a same-source repeat", () => {
    const store = new FeedbackStore({ recentLimit: 20 });
    store.recordShown(candidate({ id: "old" }), 1);
    const sameSource = candidate({ id: "same-source" });
    const freshSource = candidate({ id: "fresh-source", source: { ...candidate().source, from: 100, to: 120 } });

    expect(rankCandidates([sameSource, freshSource], { feedbackStore: store })[0].id).toBe("fresh-source");
  });

  it("pairwise: a just-rejected template falls behind an alternative", () => {
    const store = new FeedbackStore({ recentLimit: 20 });
    const rejected = candidate({ id: "rejected" });
    store.recordShown(rejected, 1);
    store.recordFeedback(rejected, "bad", 2);

    const cooled = candidate({ id: "cooled", source: { ...candidate().source, from: 100, to: 120 } });
    const alternative = candidate({
      id: "alternative",
      templateId: "causal-gap-02",
      source: { ...candidate().source, from: 200, to: 220 },
    });

    expect(rankCandidates([cooled, alternative], { feedbackStore: store })[0].id).toBe("alternative");
  });
});
