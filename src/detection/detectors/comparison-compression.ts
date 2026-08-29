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

const BARE_BI_PATTERN = /[\p{L}\p{N}]\s*比\s*(?!如|方|例|较)(?=[\p{L}\p{N}])/u;
const BARE_JIAO_PATTERN = /(?<!比)较(?!真)(?=[\p{L}\p{N}]{2,})/u;
const BARE_GENG_PATTERN = /更(?!新)/u;

export function detectComparisonCompression(source: NoteContext): Detection | undefined {
  const triggerTerms = collectTriggerTerms(source.text, STRONG_COMPARISON_TERMS);

  if (BARE_BI_PATTERN.test(source.text)) triggerTerms.push("比");
  if (BARE_JIAO_PATTERN.test(source.text)) triggerTerms.push("较");

  if (triggerTerms.length > 0 && BARE_GENG_PATTERN.test(source.text)) {
    triggerTerms.push("更");
  }

  if (triggerTerms.length === 0) return undefined;

  const hasStrongMarker = triggerTerms.some((term) =>
    ["区别在于", "不同于", "相比", "优于", "比", "较"].includes(term),
  );
  const confidence = hasStrongMarker || triggerTerms.length >= 2 ? 0.85 : 0.7;

  return makeDetection("comparison_compression", confidence, source, triggerTerms);
}
