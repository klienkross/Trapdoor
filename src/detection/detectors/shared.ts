import type { ChallengeCategory, Detection, NoteContext } from "../../domain/types";

export function collectTriggerTerms(text: string, terms: readonly string[]): string[] {
  return terms.filter((term) => text.includes(term));
}

export function extractClauseTargets(text: string, triggerTerms: readonly string[]): string[] {
  const trigger = triggerTerms.find((term) => text.includes(term));
  if (!trigger) return [];

  const index = text.indexOf(trigger);
  const before = text.slice(0, index).split(/[。！？!?；;\n]/).at(-1)?.trim() ?? "";
  const after = text
    .slice(index + trigger.length)
    .split(/[。！？!?；;\n]/)[0]
    ?.trim() ?? "";

  return [before, after].filter((part) => part.length > 0);
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
