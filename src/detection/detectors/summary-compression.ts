import type { Detection, NoteContext } from "../../domain/types";
import { collectTriggerTerms, makeDetection } from "./shared";

const SUMMARY_TERMS = ["总的来说", "归根结底", "本质上", "可以看出"] as const;

export function detectSummaryCompression(source: NoteContext): Detection | undefined {
  const triggerTerms = collectTriggerTerms(source.text, SUMMARY_TERMS);
  if (triggerTerms.length === 0) return undefined;

  const confidence = triggerTerms.includes("归根结底") ? 0.9 : 0.85;
  return makeDetection("summary_compression", confidence, source, triggerTerms);
}
