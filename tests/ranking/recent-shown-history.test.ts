import { describe, expect, it } from "vitest";
import type { ChallengeCategory, FeedbackAction, QuestionCandidate } from "../../src/domain/types";
import { FeedbackStore } from "../../src/feedback/feedback-store";
import { rankCandidates } from "../../src/ranking/question-ranker";

function candidate(
  id: string,
  category: ChallengeCategory,
  notePath: string,
  from: number,
  templateId = `${category}-template`,
): QuestionCandidate {
  return {
    id,
    category,
    templateId,
    question: `question ${id}`,
    source: {
      notePath,
      heading: null,
      from,
      to: from + 10,
      text: `source ${id}`,
      scope: "section",
    },
    targets: [`target-${id}`],
    triggerTerms: [],
    scores: {
      structure: 0.8,
      centrality: 0,
      diagnosticity: 0.9,
      followupability: 0.9,
      novelty: 0,
      repetitionPenalty: 0,
      dislikePenalty: 0,
      explorationPenalty: 0,
      final: 0,
    },
    followupRoutes: ["mechanism"],
  };
}

describe("Task 7 recent shown-question window", () => {
  it("keeps the last 10 shown questions visible to novelty and repetition despite interleaved feedback", () => {
    const store = new FeedbackStore();
    const feedbackActions: FeedbackAction[] = ["replace", "useful", "bad", "cannot_answer"];
    const shown: QuestionCandidate[] = [];

    for (let index = 0; index < 10; index += 1) {
      const category: ChallengeCategory = index < 2 ? "causal_gap" : "evidence_jump";
      const value = candidate(`shown-${index}`, category, `notes/history-${index}.md`, index * 100);
      shown.push(value);
      store.recordShown(value, index * 2);
      store.recordFeedback(value, feedbackActions[index % feedbackActions.length], index * 2 + 1);
    }

    expect(store.getRecentHistory().filter((entry) => entry.action === "shown")).toHaveLength(5);

    const noveltyTarget = candidate("novelty-target", "causal_gap", "notes/fresh.md", 5000);
    const repetitionTarget = {
      ...shown[0],
      id: "repetition-target",
      targets: ["different-target"],
      templateId: "different-template",
    };

    const [noveltyRanked] = rankCandidates([noveltyTarget], { feedbackStore: store });
    const [repetitionRanked] = rankCandidates([repetitionTarget], { feedbackStore: store });

    expect(noveltyRanked.scores.novelty).toBeCloseTo(0.8, 10);
    expect(repetitionRanked.scores.repetitionPenalty).toBeCloseTo(0.8, 10);
  });
});
