import type { ChallengeCategory, FeedbackAction, QuestionCandidate } from "../domain/types";

export type FeedbackStats = {
  shown: number;
  bad: number;
  badRate: number;
};

export type FeedbackHistoryAction = "shown" | FeedbackAction;

export type FeedbackHistoryEntry = {
  candidateId: string;
  notePath: string;
  category: ChallengeCategory;
  templateId: string;
  action: FeedbackHistoryAction;
  timestamp: number;
};

export type NoteSuppression = {
  categories: ChallengeCategory[];
  templateIds: string[];
  candidateIds: string[];
};

type Counter = {
  shown: number;
  bad: number;
};

type FeedbackStoreOptions = {
  recentLimit?: number;
};

const DEFAULT_RECENT_LIMIT = 10;

function emptyCounter(): Counter {
  return { shown: 0, bad: 0 };
}

function withBadRate(counter: Counter): FeedbackStats {
  return {
    shown: counter.shown,
    bad: counter.bad,
    badRate: (counter.bad + 1) / (counter.shown + 4),
  };
}

function pushUnique<T>(items: T[], value: T): void {
  if (!items.includes(value)) items.push(value);
}

export class FeedbackStore {
  private readonly recentLimit: number;
  private readonly templateCounters: Record<string, Counter> = {};
  private readonly categoryCounters: Partial<Record<ChallengeCategory, Counter>> = {};
  private readonly recentHistory: FeedbackHistoryEntry[] = [];
  private readonly noteSuppression: Record<string, NoteSuppression> = {};

  constructor(options: FeedbackStoreOptions = {}) {
    this.recentLimit = Math.max(1, Math.floor(options.recentLimit ?? DEFAULT_RECENT_LIMIT));
  }

  recordShown(candidate: QuestionCandidate, timestamp: number): void {
    this.getOrCreateTemplateCounter(candidate.templateId).shown += 1;
    this.getOrCreateCategoryCounter(candidate.category).shown += 1;
    this.appendHistory(candidate, "shown", timestamp);
  }

  recordFeedback(candidate: QuestionCandidate, action: FeedbackAction, timestamp: number): void {
    if (action === "bad") {
      this.getOrCreateTemplateCounter(candidate.templateId).bad += 1;
      this.getOrCreateCategoryCounter(candidate.category).bad += 1;
      this.suppressForNote(candidate);
    }

    this.appendHistory(candidate, action, timestamp);
  }

  getTemplateStats(templateId: string): FeedbackStats {
    return withBadRate(this.templateCounters[templateId] ?? emptyCounter());
  }

  getCategoryStats(category: ChallengeCategory): FeedbackStats {
    return withBadRate(this.categoryCounters[category] ?? emptyCounter());
  }

  getRecentHistory(): FeedbackHistoryEntry[] {
    return this.recentHistory.map((entry) => ({ ...entry }));
  }

  getNoteSuppression(notePath: string): NoteSuppression {
    const suppression = this.noteSuppression[notePath];
    if (!suppression) return { categories: [], templateIds: [], candidateIds: [] };

    return {
      categories: [...suppression.categories],
      templateIds: [...suppression.templateIds],
      candidateIds: [...suppression.candidateIds],
    };
  }

  isSuppressedForNote(notePath: string, candidate: QuestionCandidate): boolean {
    const suppression = this.noteSuppression[notePath];
    if (!suppression) return false;

    return (
      suppression.categories.includes(candidate.category) ||
      suppression.templateIds.includes(candidate.templateId) ||
      suppression.candidateIds.includes(candidate.id)
    );
  }

  private getOrCreateTemplateCounter(templateId: string): Counter {
    return (this.templateCounters[templateId] ??= emptyCounter());
  }

  private getOrCreateCategoryCounter(category: ChallengeCategory): Counter {
    return (this.categoryCounters[category] ??= emptyCounter());
  }

  private appendHistory(
    candidate: QuestionCandidate,
    action: FeedbackHistoryAction,
    timestamp: number,
  ): void {
    this.recentHistory.push({
      candidateId: candidate.id,
      notePath: candidate.source.notePath,
      category: candidate.category,
      templateId: candidate.templateId,
      action,
      timestamp,
    });

    if (this.recentHistory.length > this.recentLimit) {
      this.recentHistory.splice(0, this.recentHistory.length - this.recentLimit);
    }
  }

  private suppressForNote(candidate: QuestionCandidate): void {
    const notePath = candidate.source.notePath;
    const suppression = (this.noteSuppression[notePath] ??= {
      categories: [],
      templateIds: [],
      candidateIds: [],
    });

    pushUnique(suppression.categories, candidate.category);
    pushUnique(suppression.templateIds, candidate.templateId);
    pushUnique(suppression.candidateIds, candidate.id);
  }
}
