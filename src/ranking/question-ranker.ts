import type { QuestionCandidate, ScoreBreakdown } from "../domain/types";
import type { FeedbackHistoryEntry } from "../feedback/feedback-store";
import { FeedbackStore } from "../feedback/feedback-store";

export type RankCandidatesOptions = {
  feedbackStore?: FeedbackStore;
  explorationScore?: number;
  recentShownLimit?: number;
};

const DEFAULT_RECENT_SHOWN_LIMIT = 10;
const SAME_SOURCE_SAME_CATEGORY_PENALTY = 0.8;
const SAME_SOURCE_DIFFERENT_CATEGORY_PENALTY = 0.3;
const SAME_TEMPLATE_TARGETS_PENALTY = 0.8;
const EXPLORATION_PENALTY_SCALE = 0.3;
const LONG_TERM_COMPONENT_SCALE = 0.1;
const BETA_PRIOR_BAD_RATE = 0.25;
const RECENT_CATEGORY_BAD_PENALTY = 0.45;
const RECENT_TEMPLATE_BAD_PENALTY = 0.65;
const RECENT_CANDIDATE_BAD_PENALTY = 0.8;
const NEARBY_SOURCE_DISTANCE = 200;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function compareIds(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function literalCount(text: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let from = 0;
  while (from <= text.length - needle.length) {
    const index = text.indexOf(needle, from);
    if (index < 0) break;
    count += 1;
    from = index + needle.length;
  }
  return count;
}

function bodyParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !/^#{1,6}\s+[^\n]+$/.test(part));
}

function findAnchorParagraph(candidate: QuestionCandidate, paragraphs: string[]): number {
  const anchors = [...candidate.targets, ...candidate.triggerTerms]
    .map((value) => value.trim())
    .filter(Boolean);
  const index = paragraphs.findIndex((paragraph) => anchors.some((anchor) => paragraph.includes(anchor)));
  return index >= 0 ? index : 0;
}

function headingKeywordMatch(candidate: QuestionCandidate, paragraph: string): boolean {
  const heading = candidate.source.heading?.replace(/^#{1,6}\s*/, "").trim();
  if (!heading) return false;

  return candidate.targets.some((target) => {
    const term = target.trim();
    return term.length > 0 && heading.includes(term) && paragraph.includes(term);
  });
}

function containsEmphasizedTarget(candidate: QuestionCandidate): boolean {
  return candidate.targets.some((rawTarget) => {
    const target = rawTarget.trim();
    if (!target) return false;
    const text = candidate.source.text;
    return (
      text.includes(`**${target}**`) ||
      text.includes(`==${target}==`) ||
      text.includes(`[[${target}]]`) ||
      text.includes(`|${target}]]`)
    );
  });
}

export function scoreCentrality(candidate: QuestionCandidate): number {
  const paragraphs = bodyParagraphs(candidate.source.text);
  if (paragraphs.length === 0) return 0;

  const anchorIndex = findAnchorParagraph(candidate, paragraphs);
  const anchor = paragraphs[anchorIndex] ?? "";
  let score = 0;

  if (candidate.source.heading && anchorIndex === 0) score += 0.25;
  if (headingKeywordMatch(candidate, anchor)) score += 0.2;
  if (containsEmphasizedTarget(candidate)) score += 0.15;
  if (candidate.targets.some((target) => target.trim() && literalCount(candidate.source.text, target.trim()) >= 2)) {
    score += 0.2;
  }
  if (
    (paragraphs.length > 1 && anchorIndex === paragraphs.length - 1) ||
    ["总的来说", "归根结底", "可以看出", "本质上"].some((term) => anchor.includes(term))
  ) {
    score += 0.15;
  }

  return clamp01(score);
}

function recentShownHistory(store: FeedbackStore | undefined, limit: number): FeedbackHistoryEntry[] {
  if (!store) return [];
  return store.getRecentShownHistory(limit);
}

function sameSource(candidate: QuestionCandidate, entry: FeedbackHistoryEntry): boolean {
  return (
    candidate.source.notePath === entry.notePath &&
    candidate.source.from === entry.sourceFrom &&
    candidate.source.to === entry.sourceTo
  );
}

function nearbySource(candidate: QuestionCandidate, entry: FeedbackHistoryEntry): boolean {
  if (candidate.source.notePath !== entry.notePath || sameSource(candidate, entry)) return false;
  const gap = Math.max(
    0,
    Math.max(candidate.source.from, entry.sourceFrom) - Math.min(candidate.source.to, entry.sourceTo),
  );
  return gap <= NEARBY_SOURCE_DISTANCE;
}

function normalizedTargets(targets: readonly string[]): string[] {
  return [...new Set(targets.map((target) => target.trim().toLocaleLowerCase()).filter(Boolean))].sort();
}

function sameTargets(left: readonly string[], right: readonly string[]): boolean {
  const a = normalizedTargets(left);
  const b = normalizedTargets(right);
  return a.length > 0 && a.length === b.length && a.every((value, index) => value === b[index]);
}

function scoreNovelty(candidate: QuestionCandidate, history: FeedbackHistoryEntry[]): number {
  if (history.length === 0) return 1;

  const categoryCount = history.filter((entry) => entry.category === candidate.category).length;
  let novelty = 1 - categoryCount / history.length;

  if (history.some((entry) => sameSource(candidate, entry))) novelty *= 0.5;
  else if (history.some((entry) => nearbySource(candidate, entry))) novelty *= 0.75;

  return clamp01(novelty);
}

function scoreRepetitionPenalty(candidate: QuestionCandidate, history: FeedbackHistoryEntry[]): number {
  let penalty = 0;

  for (const entry of history) {
    if (sameSource(candidate, entry)) {
      penalty = Math.max(
        penalty,
        entry.category === candidate.category
          ? SAME_SOURCE_SAME_CATEGORY_PENALTY
          : SAME_SOURCE_DIFFERENT_CATEGORY_PENALTY,
      );
    }

    if (entry.templateId === candidate.templateId && sameTargets(entry.targets, candidate.targets)) {
      penalty = Math.max(penalty, SAME_TEMPLATE_TARGETS_PENALTY);
    }
  }

  return clamp01(penalty);
}

function longTermDislikePenalty(candidate: QuestionCandidate, store: FeedbackStore | undefined): number {
  if (!store) return 0;
  const categoryExcess = Math.max(0, store.getCategoryStats(candidate.category).badRate - BETA_PRIOR_BAD_RATE);
  const templateExcess = Math.max(0, store.getTemplateStats(candidate.templateId).badRate - BETA_PRIOR_BAD_RATE);
  return clamp01((categoryExcess + templateExcess) * LONG_TERM_COMPONENT_SCALE);
}

function recentDislikePenalty(candidate: QuestionCandidate, store: FeedbackStore | undefined): number {
  if (!store) return 0;
  const suppression = store.getNoteSuppression(candidate.source.notePath);
  let penalty = 0;

  if (suppression.categories.includes(candidate.category)) penalty = RECENT_CATEGORY_BAD_PENALTY;
  if (suppression.templateIds.includes(candidate.templateId)) penalty = Math.max(penalty, RECENT_TEMPLATE_BAD_PENALTY);
  if (suppression.candidateIds.includes(candidate.id)) penalty = Math.max(penalty, RECENT_CANDIDATE_BAD_PENALTY);

  return penalty;
}

function scoreDislikePenalty(candidate: QuestionCandidate, store: FeedbackStore | undefined): number {
  return clamp01(longTermDislikePenalty(candidate, store) + recentDislikePenalty(candidate, store));
}

function scoreExplorationPenalty(explorationScore: number): number {
  return clamp01(explorationScore) * EXPLORATION_PENALTY_SCALE;
}

function rankOne(
  candidate: QuestionCandidate,
  store: FeedbackStore | undefined,
  explorationScore: number,
  history: FeedbackHistoryEntry[],
): QuestionCandidate {
  const structure = clamp01(candidate.scores.structure);
  const centrality = scoreCentrality(candidate);
  const diagnosticity = clamp01(candidate.scores.diagnosticity);
  const followupability = clamp01(candidate.scores.followupability);
  const novelty = scoreNovelty(candidate, history);
  const repetitionPenalty = scoreRepetitionPenalty(candidate, history);
  const dislikePenalty = scoreDislikePenalty(candidate, store);
  const explorationPenalty = scoreExplorationPenalty(explorationScore);

  const positive =
    structure * 0.25 +
    centrality * 0.2 +
    diagnosticity * 0.25 +
    followupability * 0.15 +
    novelty * 0.15;
  const final = positive - repetitionPenalty - dislikePenalty - explorationPenalty;

  const scores: ScoreBreakdown = {
    structure,
    centrality,
    diagnosticity,
    followupability,
    novelty,
    repetitionPenalty,
    dislikePenalty,
    explorationPenalty,
    final,
  };

  return {
    ...candidate,
    source: { ...candidate.source },
    targets: [...candidate.targets],
    triggerTerms: [...candidate.triggerTerms],
    followupRoutes: [...candidate.followupRoutes],
    scores,
  };
}

export function rankCandidates(
  candidates: readonly QuestionCandidate[],
  options: RankCandidatesOptions = {},
): QuestionCandidate[] {
  if (candidates.length === 0) return [];

  const history = recentShownHistory(
    options.feedbackStore,
    options.recentShownLimit ?? DEFAULT_RECENT_SHOWN_LIMIT,
  );
  const explorationScore = options.explorationScore ?? 0;

  return candidates
    .map((candidate) => rankOne(candidate, options.feedbackStore, explorationScore, history))
    .sort((left, right) => {
      const scoreOrder = right.scores.final - left.scores.final;
      return scoreOrder !== 0 ? scoreOrder : compareIds(left.id, right.id);
    });
}
