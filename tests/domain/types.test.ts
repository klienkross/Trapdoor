import { describe, expect, it } from "vitest";
import type { QuestionCandidate } from "../../src/domain/types";

describe("QuestionCandidate", () => {
  it("supports a fully scored causal candidate", () => {
    const candidate: QuestionCandidate = {
      id: "q1",
      category: "causal_gap",
      templateId: "causal-gap-01",
      question: "‘导致’省掉了哪两步？",
      source: {
        notePath: "note.md",
        heading: "拥塞控制",
        from: 10,
        to: 30,
        text: "拥塞控制导致发送速率下降。",
        scope: "section"
      },
      targets: ["拥塞控制", "发送速率下降"],
      triggerTerms: ["导致"],
      scores: {
        structure: 0.8,
        centrality: 0.6,
        diagnosticity: 0.9,
        followupability: 0.95,
        novelty: 1,
        repetitionPenalty: 0,
        dislikePenalty: 0,
        explorationPenalty: 0,
        final: 0.82
      },
      followupRoutes: ["mechanism", "evidence"]
    };

    expect(candidate.category).toBe("causal_gap");
  });
});
