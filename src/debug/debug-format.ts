import type { QuestionCandidate } from "../domain/types";

const SCORE_KEYS = [
  "structure",
  "centrality",
  "diagnosticity",
  "followupability",
  "novelty",
  "repetitionPenalty",
  "dislikePenalty",
  "explorationPenalty",
  "final",
] as const;

export function formatScoreDebug(candidate: QuestionCandidate): string {
  return SCORE_KEYS.map((key) => `${key}: ${candidate.scores[key].toFixed(3)}`).join("\n");
}
