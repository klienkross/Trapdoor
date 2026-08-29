import type { Detection, NoteContext } from "../../domain/types";
import { collectTriggerTerms, makeDetection } from "./shared";

const EVIDENCE_TERMS = ["这意味着", "可以看出", "说明", "表明", "证明", "可见", "意味着"] as const;

export function detectEvidenceJump(source: NoteContext): Detection | undefined {
  const triggerTerms = collectTriggerTerms(source.text, EVIDENCE_TERMS);
  if (triggerTerms.length === 0) return undefined;

  const confidence = triggerTerms.includes("证明") ? 0.9 : 0.85;
  return makeDetection("evidence_jump", confidence, source, triggerTerms);
}
