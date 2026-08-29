import type { Detection, NoteContext } from "../domain/types";
import { detectCausalGap } from "./detectors/causal-gap";
import { detectDefinitionBoundary } from "./detectors/definition-boundary";
import { detectEvidenceJump } from "./detectors/evidence-jump";
import { detectComparisonCompression } from "./detectors/comparison-compression";
import { detectListStructure } from "./detectors/list-structure";
import { detectSummaryCompression } from "./detectors/summary-compression";

export function detectPatterns(source: NoteContext): Detection[] {
  const detections = [
    detectCausalGap(source),
    detectDefinitionBoundary(source),
    detectEvidenceJump(source),
    detectComparisonCompression(source),
    detectListStructure(source),
    detectSummaryCompression(source),
  ];

  return detections.filter(
    (detection): detection is Detection => detection !== undefined,
  );
}
