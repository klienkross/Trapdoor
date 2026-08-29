import type { ChallengeCategory } from "../domain/types";
import {
  FeedbackStore,
  type FeedbackCounter,
  type FeedbackHistoryAction,
  type FeedbackHistoryEntry,
  type FeedbackStoreOptions,
  type FeedbackStoreState,
} from "../feedback/feedback-store";

export const FEEDBACK_FILE_PATH = "question-feedback.json";

export type TextFileStore = {
  read(path: string): Promise<string | null>;
  write(path: string, contents: string): Promise<void>;
};

export type FeedbackFileErrorKind = "invalid_json" | "invalid_shape";

export class FeedbackFileError extends Error {
  constructor(public readonly kind: FeedbackFileErrorKind) {
    super(kind === "invalid_json" ? "Feedback file contains invalid JSON." : "Feedback file has an invalid shape.");
    this.name = "FeedbackFileError";
  }
}

export type FeedbackFileV1 = FeedbackStoreState & {
  version: 1;
};

const CATEGORIES: readonly ChallengeCategory[] = [
  "causal_gap",
  "definition_boundary",
  "evidence_jump",
  "comparison_compression",
  "list_structure",
  "summary_compression",
];

const ACTIONS: readonly FeedbackHistoryAction[] = [
  "shown",
  "bad",
  "useful",
  "cannot_answer",
  "replace",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function parseCounter(value: unknown): FeedbackCounter | null {
  if (!isRecord(value) || !isNonNegativeInteger(value.shown) || !isNonNegativeInteger(value.bad)) {
    return null;
  }

  return { shown: value.shown, bad: value.bad };
}

function parseHistoryEntry(value: unknown): FeedbackHistoryEntry | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.candidateId !== "string" ||
    typeof value.notePath !== "string" ||
    typeof value.category !== "string" ||
    !CATEGORIES.includes(value.category as ChallengeCategory) ||
    typeof value.templateId !== "string" ||
    !isNonNegativeInteger(value.sourceFrom) ||
    !isNonNegativeInteger(value.sourceTo) ||
    !Array.isArray(value.targets) ||
    !value.targets.every((target) => typeof target === "string") ||
    typeof value.action !== "string" ||
    !ACTIONS.includes(value.action as FeedbackHistoryAction) ||
    typeof value.timestamp !== "number" ||
    !Number.isFinite(value.timestamp)
  ) {
    return null;
  }

  return {
    candidateId: value.candidateId,
    notePath: value.notePath,
    category: value.category as ChallengeCategory,
    templateId: value.templateId,
    sourceFrom: value.sourceFrom,
    sourceTo: value.sourceTo,
    targets: [...value.targets],
    action: value.action as FeedbackHistoryAction,
    timestamp: value.timestamp,
  };
}

function parseState(value: unknown): FeedbackStoreState | null {
  if (!isRecord(value) || value.version !== 1) return null;
  if (!isRecord(value.templates) || !isRecord(value.categories)) return null;
  if (!Array.isArray(value.recentHistory) || !Array.isArray(value.recentShownHistory)) return null;

  const templates: Record<string, FeedbackCounter> = {};
  for (const [templateId, rawCounter] of Object.entries(value.templates)) {
    const counter = parseCounter(rawCounter);
    if (!counter) return null;
    templates[templateId] = counter;
  }

  const categories: Partial<Record<ChallengeCategory, FeedbackCounter>> = {};
  for (const [category, rawCounter] of Object.entries(value.categories)) {
    if (!CATEGORIES.includes(category as ChallengeCategory)) return null;
    const counter = parseCounter(rawCounter);
    if (!counter) return null;
    categories[category as ChallengeCategory] = counter;
  }

  const recentHistory: FeedbackHistoryEntry[] = [];
  for (const entry of value.recentHistory) {
    const parsed = parseHistoryEntry(entry);
    if (!parsed) return null;
    recentHistory.push(parsed);
  }

  const recentShownHistory: FeedbackHistoryEntry[] = [];
  for (const entry of value.recentShownHistory) {
    const parsed = parseHistoryEntry(entry);
    if (!parsed || parsed.action !== "shown") return null;
    recentShownHistory.push(parsed);
  }

  return { templates, categories, recentHistory, recentShownHistory };
}

function sortCounters(counters: Record<string, FeedbackCounter>): Record<string, FeedbackCounter> {
  return Object.fromEntries(
    Object.entries(counters)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, { shown: value.shown, bad: value.bad }]),
  );
}

function sortCategoryCounters(
  counters: Partial<Record<ChallengeCategory, FeedbackCounter>>,
): Partial<Record<ChallengeCategory, FeedbackCounter>> {
  const sorted: Partial<Record<ChallengeCategory, FeedbackCounter>> = {};
  for (const category of CATEGORIES) {
    const counter = counters[category];
    if (counter) sorted[category] = { shown: counter.shown, bad: counter.bad };
  }
  return sorted;
}

function toFile(state: FeedbackStoreState): FeedbackFileV1 {
  return {
    version: 1,
    templates: sortCounters(state.templates),
    categories: sortCategoryCounters(state.categories),
    recentHistory: state.recentHistory.map((entry) => ({ ...entry, targets: [...entry.targets] })),
    recentShownHistory: state.recentShownHistory.map((entry) => ({ ...entry, targets: [...entry.targets] })),
  };
}

export async function loadFeedback(
  files: TextFileStore,
  options: FeedbackStoreOptions = {},
): Promise<FeedbackStore> {
  const contents = await files.read(FEEDBACK_FILE_PATH);
  if (contents === null) return new FeedbackStore(options);

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(contents);
  } catch {
    throw new FeedbackFileError("invalid_json");
  }

  const state = parseState(parsedJson);
  if (!state) throw new FeedbackFileError("invalid_shape");

  return FeedbackStore.fromState(state, options);
}

export async function saveFeedback(files: TextFileStore, store: FeedbackStore): Promise<void> {
  const contents = `${JSON.stringify(toFile(store.exportState()), null, 2)}\n`;
  await files.write(FEEDBACK_FILE_PATH, contents);
}

export function hasMeaningfulFeedback(state: FeedbackStoreState): boolean {
  const counters = [
    ...Object.values(state.templates),
    ...Object.values(state.categories),
  ].filter((counter): counter is FeedbackCounter => counter !== undefined);

  return (
    counters.some((counter) => counter.shown > 0 || counter.bad > 0) ||
    state.recentHistory.length > 0 ||
    state.recentShownHistory.length > 0
  );
}

export async function clearFeedback(files: TextFileStore, store: FeedbackStore): Promise<void> {
  store.clear();
  await saveFeedback(files, store);
}
