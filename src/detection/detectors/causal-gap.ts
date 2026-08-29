import type { Detection, NoteContext } from "../../domain/types";
import { collectTriggerTerms, makeDetection } from "./shared";

const CAUSAL_TERMS = ["因为", "所以", "导致", "因此", "从而", "使得", "结果是"] as const;
const STRONG_SINGLE = new Set(["导致", "因此", "从而", "使得", "结果是"]);

export function detectCausalGap(source: NoteContext): Detection | undefined {
  const triggerTerms = collectTriggerTerms(source.text, CAUSAL_TERMS);
  if (triggerTerms.length === 0) return undefined;

  const hasPairedStructure =
    source.text.includes("因为") && (source.text.includes("所以") || source.text.includes("因此"));
  const hasStrongSingle = triggerTerms.some((term) => STRONG_SINGLE.has(term));

  const confidence = hasPairedStructure
    ? 1
    : triggerTerms.length >= 2
      ? 0.9
      : hasStrongSingle
        ? 0.8
        : 0.75;

  return makeDetection("causal_gap", confidence, source, triggerTerms);
}
