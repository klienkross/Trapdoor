import type { Detection, NoteContext } from "../../domain/types";
import { collectTriggerTerms, makeDetection } from "./shared";

const COMPARISON_TERMS = [
  "区别在于",
  "不同于",
  "相比",
  "优于",
  "更多",
  "更少",
  "更灵活",
  "比",
  "较",
  "更",
] as const;

export function detectComparisonCompression(source: NoteContext): Detection | undefined {
  const triggerTerms = collectTriggerTerms(source.text, COMPARISON_TERMS);
  if (triggerTerms.length === 0) return undefined;

  const hasStrongMarker = triggerTerms.some((term) =>
    ["区别在于", "不同于", "相比", "优于", "比", "较"].includes(term),
  );
  const confidence = hasStrongMarker || triggerTerms.length >= 2 ? 0.85 : 0.7;

  return makeDetection("comparison_compression", confidence, source, triggerTerms);
}
