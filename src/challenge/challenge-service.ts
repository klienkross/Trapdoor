import { extractSection, extractWholeNote } from "../context/context-extractor";
import {
  measureExploration,
  type ExplorationMeasurement,
} from "../context/suitability-detector";
import { detectPatterns } from "../detection/pattern-detector";
import type { QuestionCandidate } from "../domain/types";
import type { FeedbackStore } from "../feedback/feedback-store";
import { generateCandidates } from "../generation/question-generator";
import { rankCandidates } from "../ranking/question-ranker";

export const CHALLENGE_VIABILITY_THRESHOLD = 0.35;

export type ChallengeRequest = {
  markdown: string;
  cursorOffset: number;
  notePath: string;
  feedbackStore: FeedbackStore;
};

export type ChallengeResult =
  | {
      status: "question";
      candidate: QuestionCandidate;
    }
  | {
      status: "not_suitable";
      scope: "section" | "note";
      exploration: ExplorationMeasurement;
    }
  | {
      status: "none";
    };

export type ChallengeServiceDependencies = {
  extractSection: typeof extractSection;
  extractWholeNote: typeof extractWholeNote;
  measureExploration: typeof measureExploration;
  detectPatterns: typeof detectPatterns;
  generateCandidates: typeof generateCandidates;
  rankCandidates: typeof rankCandidates;
};

const defaultDependencies: ChallengeServiceDependencies = {
  extractSection,
  extractWholeNote,
  measureExploration,
  detectPatterns,
  generateCandidates,
  rankCandidates,
};

type ContextAttempt = {
  exploration: ExplorationMeasurement;
  ranked: QuestionCandidate[];
};

function runContext(
  source: ReturnType<typeof extractSection>,
  feedbackStore: FeedbackStore,
  dependencies: ChallengeServiceDependencies,
): ContextAttempt {
  const exploration = dependencies.measureExploration(source.text);

  if (exploration.shouldSkip) {
    return { exploration, ranked: [] };
  }

  const detections = dependencies.detectPatterns(source);
  const candidates = dependencies.generateCandidates(detections);
  const ranked = dependencies.rankCandidates(candidates, {
    feedbackStore,
    explorationScore: exploration.score,
  });

  return { exploration, ranked };
}

function firstViable(ranked: readonly QuestionCandidate[]): QuestionCandidate | undefined {
  return ranked.find((candidate) => candidate.scores.final >= CHALLENGE_VIABILITY_THRESHOLD);
}

export function requestChallenge(
  request: ChallengeRequest,
  overrides: Partial<ChallengeServiceDependencies> = {},
): ChallengeResult {
  const dependencies: ChallengeServiceDependencies = {
    ...defaultDependencies,
    ...overrides,
  };

  const section = dependencies.extractSection(
    request.markdown,
    request.cursorOffset,
    request.notePath,
  );
  const sectionAttempt = runContext(section, request.feedbackStore, dependencies);

  if (sectionAttempt.exploration.shouldSkip) {
    return {
      status: "not_suitable",
      scope: "section",
      exploration: sectionAttempt.exploration,
    };
  }

  const sectionCandidate = firstViable(sectionAttempt.ranked);
  if (sectionCandidate) {
    return { status: "question", candidate: sectionCandidate };
  }

  const note = dependencies.extractWholeNote(request.markdown, request.notePath);
  const noteAttempt = runContext(note, request.feedbackStore, dependencies);

  if (noteAttempt.exploration.shouldSkip) {
    return {
      status: "not_suitable",
      scope: "note",
      exploration: noteAttempt.exploration,
    };
  }

  const noteCandidate = firstViable(noteAttempt.ranked);
  if (noteCandidate) {
    return { status: "question", candidate: noteCandidate };
  }

  return { status: "none" };
}
