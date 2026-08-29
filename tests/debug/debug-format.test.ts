import { describe, expect, it } from "vitest";
import type { QuestionCandidate } from "../../src/domain/types";
import { formatScoreDebug } from "../../src/debug/debug-format";

function candidate(): QuestionCandidate {
  return {
    id: "candidate-a",
    category: "causal_gap",
    templateId: "causal-gap-01",
    question: "问题",
    source: { notePath: "notes/a.md", heading: null, from: 0, to: 10, text: "source", scope: "section" },
    targets: ["A"],
    triggerTerms: ["导致"],
    scores: {
      structure: 0.8,
      centrality: 0.4,
      diagnosticity: 0.9,
      followupability: 0.95,
      novelty: 0.7,
      repetitionPenalty: 0.3,
      dislikePenalty: 0.1,
      explorationPenalty: 0.2,
      final: 0.42,
    },
    followupRoutes: ["mechanism"],
  };
}

describe("formatScoreDebug", () => {
  it("includes every published score component", () => {
    const output = formatScoreDebug(candidate());

    for (const key of [
      "structure",
      "centrality",
      "diagnosticity",
      "followupability",
      "novelty",
      "repetitionPenalty",
      "dislikePenalty",
      "explorationPenalty",
      "final",
    ]) {
      expect(output).toContain(key);
    }
  });
});
