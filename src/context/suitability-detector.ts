export const EXPLORATION_SKIP_THRESHOLD = 0.8;

export type ExplorationSignalKind =
  | "question_mark_density"
  | "uncertainty_terms"
  | "draft_markers"
  | "competing_hypotheses";

export type ExplorationSignal = {
  kind: ExplorationSignalKind;
  contribution: number;
  matches: string[];
};

export type ExplorationMeasurement = {
  score: number;
  signals: ExplorationSignal[];
  shouldSkip: boolean;
};

const UNCERTAINTY_TERMS = ["可能", "也许", "猜测", "不确定", "待验证"];
const DRAFT_MARKERS = ["TODO", "DRAFT", "草稿", "WIP", "脑暴", "brainstorm"];

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function collectLiteralMatches(text: string, terms: readonly string[]): string[] {
  const matches: string[] = [];

  for (const term of terms) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const flags = /[A-Za-z]/.test(term) ? "gi" : "g";
    const pattern = new RegExp(escaped, flags);

    for (const match of text.matchAll(pattern)) {
      matches.push(match[0]);
    }
  }

  return matches;
}

function collectCompetingHypothesisMatches(text: string): string[] {
  const matches: string[] = [];
  const patterns = [
    /假设\s*[A-ZＡ-Ｚ一二三四五六七八九十1-9][：:]/gi,
    /另一种(?:解释|假设|可能)/g,
    /替代解释/g,
    /一方面[\s\S]{0,80}另一方面/g,
    /(?:也|还)?可能是[\s\S]{0,60}(?:也|还)可能是/g,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      matches.push(match[0]);
    }
  }

  return matches;
}

export function measureExploration(text: string): ExplorationMeasurement {
  const signals: ExplorationSignal[] = [];
  const compactLength = text.replace(/\s/g, "").length;
  const questionMatches = text.match(/[?？]/g) ?? [];

  if (questionMatches.length > 0) {
    const densityPerHundredChars =
      (questionMatches.length / Math.max(1, compactLength)) * 100;
    const densityContribution = densityPerHundredChars * 0.2;
    const countContribution = questionMatches.length * 0.2;

    signals.push({
      kind: "question_mark_density",
      contribution: Math.min(0.8, densityContribution, countContribution),
      matches: questionMatches,
    });
  }

  const uncertaintyMatches = collectLiteralMatches(text, UNCERTAINTY_TERMS);
  if (uncertaintyMatches.length > 0) {
    signals.push({
      kind: "uncertainty_terms",
      contribution: Math.min(0.35, uncertaintyMatches.length * 0.07),
      matches: uncertaintyMatches,
    });
  }

  const draftMatches = collectLiteralMatches(text, DRAFT_MARKERS);
  if (draftMatches.length > 0) {
    signals.push({
      kind: "draft_markers",
      contribution: Math.min(0.3, draftMatches.length * 0.15),
      matches: draftMatches,
    });
  }

  const competingMatches = collectCompetingHypothesisMatches(text);
  if (competingMatches.length >= 2) {
    signals.push({
      kind: "competing_hypotheses",
      contribution: Math.min(0.4, competingMatches.length * 0.2),
      matches: competingMatches,
    });
  }

  const score = clamp01(
    signals.reduce((total, signal) => total + signal.contribution, 0),
  );

  return {
    score,
    signals,
    shouldSkip: score >= EXPLORATION_SKIP_THRESHOLD,
  };
}
