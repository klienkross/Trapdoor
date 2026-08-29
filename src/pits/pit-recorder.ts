import type { QuestionCandidate } from "../domain/types";

function quoteQuestion(question: string): string {
  return question.split("\n").map((line) => `> ${line}`).join("\n");
}

export function buildPitCallout(candidate: QuestionCandidate): string {
  return `> [!question] 认知坑\n${quoteQuestion(candidate.question)}\n`;
}

function resolveInsertionOffset(markdown: string, candidate: QuestionCandidate): number {
  const raw = candidate.source.to;
  const clamped = Math.min(Math.max(raw, 0), markdown.length);

  if (raw !== clamped) {
    return markdown.length;
  }

  return clamped;
}

function hasAdjacentExactCallout(
  markdown: string,
  offset: number,
  callout: string,
): boolean {
  const padding = 4;
  const start = Math.max(0, offset - callout.length - padding);
  const end = Math.min(markdown.length, offset + callout.length + padding);
  return markdown.slice(start, end).includes(callout);
}

function leadingSpacing(prefix: string): string {
  if (prefix.length === 0) return "";
  if (/(?:\r?\n){2}$/.test(prefix)) return "";
  if (/\r?\n$/.test(prefix)) return "\n";
  return "\n\n";
}

function trailingSpacing(suffix: string): string {
  if (suffix.length === 0) return "";
  if (/^(?:\r?\n)/.test(suffix)) return "";
  return "\n";
}

export function insertPit(markdown: string, candidate: QuestionCandidate): string {
  const callout = buildPitCallout(candidate);
  const offset = resolveInsertionOffset(markdown, candidate);

  if (hasAdjacentExactCallout(markdown, offset, callout)) {
    return markdown;
  }

  const prefix = markdown.slice(0, offset);
  const suffix = markdown.slice(offset);

  return (
    prefix +
    leadingSpacing(prefix) +
    callout +
    trailingSpacing(suffix) +
    suffix
  );
}
