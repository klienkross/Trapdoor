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
  sourceFrom: number;
  sourceTo: number;
  targets: string[];
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
  recentShownLimit?: number;
};

const DEFAULT_RECENT_LIMIT = 10;
const DEFAULT_RECENT_SHOWN_LIMIT = 10;

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
  private readonly recentShownLimit: number;
  private readonly templateCounters: Record<string, Counter> = {};
  private readonly categoryCounters: Partial<Record<ChallengeCategory, Counter>> = {};
  private readonly recentHistory: FeedbackHistoryEntry[] = [];
  private readonly recentShownHistory: FeedbackHistoryEntry[] = [];

  constructor(options: FeedbackStoreOptions = {}) {
    this.recentLimit = Math.max(1, Math.floor(options.recentLimit ?? DEFAULT_RECENT_LIMIT));
    this.recentShownLimit = Math.max(
      DEFAULT_RECENT_SHOWN_LIMIT,
      Math.floor(options.recentShownLimit ?? DEFAULT_RECENT_SHOWN_LIMIT),
    );
  }

  recordShown(candidate: QuestionCandidate, timestamp: number): void {
    this.getOrCreateTemplateCounter(candidate.templateId).shown += 1;
    this.getOrCreateCategoryCounter(candidate.category).shown += 1;
    const entry = this.createHistoryEntry(candidate, "shown", timestamp);
    this.appendRecentHistory(entry);
    this.appendRecentShownHistory(entry);
  }

  recordFeedback(candidate: QuestionCandidate, action: FeedbackAction, timestamp: number): void {
    if (action === "bad") {
      this.getOrCreateTemplateCounter(candidate.templateId).bad += 1;
      this.getOrCreateCategoryCounter(candidate.category).bad += 1;
    }

    this.appendRecentHistory(this.createHistoryEntry(candidate, action, timestamp));
  }

  getTemplateStats(templateId: string): FeedbackStats {
    return withBadRate(this.templateCounters[templateId] ?? emptyCounter());
  }

  getCategoryStats(category: ChallengeCategory): FeedbackStats {
    return withBadRate(this.categoryCounters[category] ?? emptyCounter());
  }

  getRecentHistory(): FeedbackHistoryEntry[] {
    return this.cloneHistory(this.recentHistory);
  }

  getRecentShownHistory(limit = DEFAULT_RECENT_SHOWN_LIMIT): FeedbackHistoryEntry[] {
    const boundedLimit = Math.max(1, Math.floor(limit));
    return this.cloneHistory(this.recentShownHistory.slice(-boundedLimit));
  }

  getNoteSuppression(notePath: string): NoteSuppression {
    const suppression: NoteSuppression = {
      categories: [],
      templateIds: [],
      candidateIds: [],
    };

    for (const entry of this.recentHistory) {
      if (entry.action !== "bad" || entry.notePath !== notePath) continue;

      pushUnique(suppression.categories, entry.category);
      pushUnique(suppression.templateIds, entry.templateId);
      pushUnique(suppression.candidateIds, entry.candidateId);
    }

    return suppression;
  }

  isSuppressedForNote(notePath: string, candidate: QuestionCandidate): boolean {
    const suppression = this.getNoteSuppression(notePath);

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

  private createHistoryEntry(
    candidate: QuestionCandidate,
    action: FeedbackHistoryAction,
    timestamp: number,
  ): FeedbackHistoryEntry {
    return {
      candidateId: candidate.id,
      notePath: candidate.source.notePath,
      category: candidate.category,
      templateId: candidate.templateId,
      sourceFrom: candidate.source.from,
      sourceTo: candidate.source.to,
      targets: [...candidate.targets],
      action,
      timestamp,
    };
  }

  private appendRecentHistory(entry: FeedbackHistoryEntry): void {
    this.recentHistory.push(entry);

    if (this.recentHistory.length > this.recentLimit) {
      this.recentHistory.splice(0, this.recentHistory.length - this.recentLimit);
    }
  }

  private appendRecentShownHistory(entry: FeedbackHistoryEntry): void {
    this.recentShownHistory.push(entry);

    if (this.recentShownHistory.length > this.recentShownLimit) {
      this.recentShownHistory.splice(0, this.recentShownHistory.length - this.recentShownLimit);
    }
  }

  private cloneHistory(history: readonly FeedbackHistoryEntry[]): FeedbackHistoryEntry[] {
    return history.map((entry) => ({ ...entry, targets: [...entry.targets] }));
  }
}
