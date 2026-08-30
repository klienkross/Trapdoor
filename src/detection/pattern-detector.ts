import type { Detection, NoteContext } from "../domain/types";
import { projectChallengeableProse } from "./challengeable-prose";
import { detectCausalGap } from "./detectors/causal-gap";
import { detectDefinitionBoundary } from "./detectors/definition-boundary";
import { detectEvidenceJump } from "./detectors/evidence-jump";
import { detectComparisonCompression } from "./detectors/comparison-compression";
import { detectListStructure } from "./detectors/list-structure";
import { detectSummaryCompression } from "./detectors/summary-compression";

export function detectPatterns(source: NoteContext): Detection[] {
  const projectedSource = {
    ...source,
    text: projectChallengeableProse(source.text),
  };

  const detections = [
    detectCausalGap(projectedSource),
    detectDefinitionBoundary(projectedSource),
    detectEvidenceJump(projectedSource),
    detectComparisonCompression(projectedSource),
    detectListStructure(projectedSource),
    detectSummaryCompression(projectedSource),
  ];

  return detections
    .filter(
      (detection): detection is Detection =>
        detection !== undefined && detection.targets.length > 0,
    )
    .map((detection) => ({
      ...detection,
      source,
    }));
}
