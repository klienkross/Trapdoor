import { describe, expect, it } from "vitest";
import type { ChallengeCategory, FeedbackAction, QuestionCandidate } from "../../src/domain/types";
import { FeedbackStore } from "../../src/feedback/feedback-store";

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

describe("FeedbackStore", () => {
  it("starts template and category counters at zero", () => {
    const store = new FeedbackStore();

    expect(store.getTemplateStats("causal-gap-01")).toEqual({ shown: 0, bad: 0, badRate: 0.25 });
    expect(store.getCategoryStats("causal_gap")).toEqual({ shown: 0, bad: 0, badRate: 0.25 });
  });

  it("records shown counts for the candidate template and category", () => {
    const store = new FeedbackStore();
    const value = candidate("one");

    store.recordShown(value, 10);
    store.recordShown(value, 20);

    expect(store.getTemplateStats(value.templateId).shown).toBe(2);
    expect(store.getCategoryStats(value.category).shown).toBe(2);
  });

  it("records bad feedback for the candidate template and category", () => {
    const store = new FeedbackStore();
    const value = candidate("one");

    store.recordShown(value, 10);
    store.recordFeedback(value, "bad", 20);

    expect(store.getTemplateStats(value.templateId).bad).toBe(1);
    expect(store.getCategoryStats(value.category).bad).toBe(1);
  });

  it("uses the exact beta-smoothed bad-rate formula", () => {
    const store = new FeedbackStore();
    const value = candidate("one");

    for (let i = 0; i < 6; i += 1) store.recordShown(value, i);
    store.recordFeedback(value, "bad", 10);
    store.recordFeedback(value, "bad", 11);

    expect(store.getTemplateStats(value.templateId).badRate).toBe((2 + 1) / (6 + 4));
    expect(store.getCategoryStats(value.category).badRate).toBe((2 + 1) / (6 + 4));
  });

  it("never counts replace as bad feedback", () => {
    const store = new FeedbackStore();
    const value = candidate("one");

    store.recordShown(value, 10);
    store.recordFeedback(value, "replace", 20);

    expect(store.getTemplateStats(value.templateId).bad).toBe(0);
    expect(store.getCategoryStats(value.category).bad).toBe(0);
    expect(store.getRecentHistory().at(-1)?.action).toBe("replace");
  });

  it.each<FeedbackAction>(["useful", "cannot_answer"])("does not count %s as bad feedback", (action) => {
    const store = new FeedbackStore();
    const value = candidate("one");

    store.recordShown(value, 10);
    store.recordFeedback(value, action, 20);

    expect(store.getTemplateStats(value.templateId).bad).toBe(0);
    expect(store.getCategoryStats(value.category).bad).toBe(0);
  });

  it("bounds recent history and evicts the oldest records", () => {
    const store = new FeedbackStore({ recentLimit: 3 });

    store.recordShown(candidate("one"), 10);
    store.recordShown(candidate("two"), 20);
    store.recordFeedback(candidate("two"), "replace", 30);
    store.recordShown(candidate("three"), 40);

    expect(store.getRecentHistory().map((entry) => entry.timestamp)).toEqual([20, 30, 40]);
  });

  it("keeps note-local suppression isolated between notes", () => {
    const store = new FeedbackStore();
    const rejected = candidate("one", "notes/a.md");

    store.recordFeedback(rejected, "bad", 10);

    expect(store.isSuppressedForNote("notes/a.md", rejected)).toBe(true);
    expect(store.isSuppressedForNote("notes/b.md", candidate("one", "notes/b.md"))).toBe(false);
  });

  it("exposes recent bad category, template, and candidate rejection for the same note", () => {
    const store = new FeedbackStore();
    const rejected = candidate("one", "notes/a.md");

    store.recordFeedback(rejected, "bad", 10);

    expect(store.getNoteSuppression("notes/a.md")).toEqual({
      categories: ["causal_gap"],
      templateIds: ["causal-gap-01"],
      candidateIds: ["one"],
    });
  });

  it("uses candidate.source.notePath for note-local suppression", () => {
    const store = new FeedbackStore();
    const rejected = candidate("one", "nested/source.md");

    store.recordFeedback(rejected, "bad", 10);

    expect(store.getNoteSuppression("nested/source.md").candidateIds).toEqual(["one"]);
  });

  it("does not suppress replace, useful, or cannot_answer actions", () => {
    const store = new FeedbackStore();
    const actions: FeedbackAction[] = ["replace", "useful", "cannot_answer"];

    actions.forEach((action, index) => store.recordFeedback(candidate(String(index)), action, index));

    expect(store.getNoteSuppression("notes/a.md")).toEqual({ categories: [], templateIds: [], candidateIds: [] });
  });

  it("expires note-local suppression when its bad entry leaves recent history", () => {
    const store = new FeedbackStore({ recentLimit: 2 });
    const rejected = candidate("rejected", "notes/a.md");

    store.recordFeedback(rejected, "bad", 10);
    store.recordShown(candidate("other", "notes/a.md", "evidence_jump", "evidence-jump-01"), 20);
    store.recordFeedback(candidate("another", "notes/a.md", "definition_boundary", "definition-boundary-01"), "replace", 30);

    expect(store.getRecentHistory().map((entry) => entry.timestamp)).toEqual([20, 30]);
    expect(store.isSuppressedForNote("notes/a.md", rejected)).toBe(false);
    expect(store.getNoteSuppression("notes/a.md")).toEqual({ categories: [], templateIds: [], candidateIds: [] });
  });

  it("keeps suppression while another matching bad remains in recent history", () => {
    const store = new FeedbackStore({ recentLimit: 3 });
    const rejected = candidate("rejected", "notes/a.md");

    store.recordFeedback(rejected, "bad", 10);
    store.recordFeedback(rejected, "bad", 20);
    store.recordShown(candidate("other", "notes/a.md", "evidence_jump", "evidence-jump-01"), 30);
    store.recordShown(candidate("another", "notes/a.md", "definition_boundary", "definition-boundary-01"), 40);

    expect(store.getRecentHistory().map((entry) => entry.timestamp)).toEqual([20, 30, 40]);
    expect(store.isSuppressedForNote("notes/a.md", rejected)).toBe(true);
    expect(store.getNoteSuppression("notes/a.md")).toEqual({
      categories: ["causal_gap"],
      templateIds: ["causal-gap-01"],
      candidateIds: ["rejected"],
    });
  });

  it("keeps recent suppression isolated by note after unrelated history eviction", () => {
    const store = new FeedbackStore({ recentLimit: 3 });
    const rejectedA = candidate("same", "notes/a.md");
    const rejectedB = candidate("same", "notes/b.md");

    store.recordFeedback(rejectedA, "bad", 10);
    store.recordFeedback(rejectedB, "bad", 20);
    store.recordShown(candidate("other", "notes/a.md", "evidence_jump", "evidence-jump-01"), 30);
    store.recordShown(candidate("another", "notes/a.md", "definition_boundary", "definition-boundary-01"), 40);

    expect(store.isSuppressedForNote("notes/a.md", rejectedA)).toBe(false);
    expect(store.isSuppressedForNote("notes/b.md", rejectedB)).toBe(true);
  });

  it("does not rank candidates or mutate their scores", () => {
    const store = new FeedbackStore();
    const value = candidate("one");
    const originalScores = { ...value.scores };

    store.recordShown(value, 10);
    store.recordFeedback(value, "bad", 20);

    expect(value.scores).toEqual(originalScores);
  });
});
