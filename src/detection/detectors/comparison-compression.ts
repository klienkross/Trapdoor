import type { Detection, NoteContext } from "../../domain/types";
import { collectTriggerTerms, makeDetection } from "./shared";

const STRONG_COMPARISON_TERMS = [
  "区别在于",
  "不同于",
  "相比",
  "优于",
  "更多",
  "更少",
  "更灵活",
] as const;

const WEAK_COMPARISON_TRIGGERS = [
  ["比", /(?<!相)比(?!如|较)/u],
  ["较", /(?<!比)较/u],
  ["更", /更(?!新)/u],
] as const;

export function detectComparisonCompression(source: NoteContext): Detection | undefined {
  const triggerTerms = collectTriggerTerms(source.text, STRONG_COMPARISON_TERMS);

  for (const [term, pattern] of WEAK_COMPARISON_TRIGGERS) {
    if (pattern.test(source.text)) triggerTerms.push(term);
  }

  if (triggerTerms.length === 0) return undefined;

  const hasStrongMarker = triggerTerms.some((term) =>
    ["区别在于", "不同于", "相比", "优于", "比", "较"].includes(term),
  );
  const confidence = hasStrongMarker || triggerTerms.length >= 2 ? 0.85 : 0.7;

  return makeDetection("comparison_compression", confidence, source, triggerTerms);
}
