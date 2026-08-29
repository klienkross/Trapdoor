import type { Detection, NoteContext } from "../../domain/types";
import { collectTriggerTerms, makeDetection } from "./shared";

const DEFINITION_TERMS = ["指的是", "定义为", "本质上", "可以理解为", "意味着", "是"] as const;

export function detectDefinitionBoundary(source: NoteContext): Detection | undefined {
  const triggerTerms = collectTriggerTerms(source.text, DEFINITION_TERMS);
  if (triggerTerms.length === 0) return undefined;

  const confidence = triggerTerms.some((term) => term !== "是") ? 0.85 : 0.75;
  return makeDetection("definition_boundary", confidence, source, triggerTerms);
}
