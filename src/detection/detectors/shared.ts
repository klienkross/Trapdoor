import type { ChallengeCategory, Detection, NoteContext } from "../../domain/types";

const CLAUSE_BOUNDARY = /(?:[。！？!?；;\n]|…{2,}|\.{3,})/u;

export function collectTriggerTerms(text: string, terms: readonly string[]): string[] {
  return terms.filter((term) => text.includes(term));
}

function isInsideParentheses(text: string, index: number): boolean {
  const stack: string[] = [];

  for (let cursor = 0; cursor < index; cursor += 1) {
    const char = text[cursor];
    if (char === "(" || char === "（") {
      stack.push(char);
      continue;
    }

    if (char === ")" && stack.at(-1) === "(") stack.pop();
    if (char === "）" && stack.at(-1) === "（") stack.pop();
  }

  return stack.length > 0;
}

function hasBalancedParentheses(text: string): boolean {
  const stack: string[] = [];

  for (const char of text) {
    if (char === "(" || char === "（") {
      stack.push(char);
      continue;
    }

    if (char === ")") {
      if (stack.pop() !== "(") return false;
      continue;
    }

    if (char === "）" && stack.pop() !== "（") return false;
  }

  return stack.length === 0;
}

export function extractClauseTargets(text: string, triggerTerms: readonly string[]): string[] {
  const trigger = triggerTerms.find((term) => text.includes(term));
  if (!trigger) return [];

  const index = text.indexOf(trigger);

  // A relation anchor inside parentheses cannot be safely sliced by the
  // lightweight clause extractor. Prefer suppressing it over producing a
  // visibly broken half-parenthetical target.
  if (isInsideParentheses(text, index)) return [];

  const before = text.slice(0, index).split(CLAUSE_BOUNDARY).at(-1)?.trim() ?? "";
  const after = text
    .slice(index + trigger.length)
    .split(CLAUSE_BOUNDARY)[0]
    ?.trim() ?? "";

  const targets = [before, after].filter((part) => part.length > 0);
  return targets.every(hasBalancedParentheses) ? targets : [];
}

export function makeDetection(
  category: ChallengeCategory,
  confidence: number,
  source: NoteContext,
  triggerTerms: string[],
  targets = extractClauseTargets(source.text, triggerTerms),
): Detection {
  return {
    category,
    confidence,
    source,
    targets,
    triggerTerms,
  };
}
