import type {
  Detection,
  QuestionCandidate,
  ScoreBreakdown,
} from "../domain/types";
import { questionTemplates } from "./templates";

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function candidateId(detection: Detection, templateId: string) {
  const source = detection.source;
  const fingerprint = [
    templateId,
    detection.category,
    source.notePath,
    source.heading ?? "",
    source.from,
    source.to,
    source.text,
    detection.targets.join("\u001f"),
    detection.triggerTerms.join("\u001f"),
  ].join("\u001e");

  return `${templateId}:${stableHash(fingerprint)}`;
}

function initialScores(
  detection: Detection,
  diagnosticity: number,
  followupability: number,
): ScoreBreakdown {
  return {
    structure: detection.confidence,
    centrality: 0,
    diagnosticity,
    followupability,
    novelty: 0,
    repetitionPenalty: 0,
    dislikePenalty: 0,
    explorationPenalty: 0,
    final: 0,
  };
}

export function generateCandidates(detections: Detection[]): QuestionCandidate[] {
  const candidates: QuestionCandidate[] = [];

  for (const detection of detections) {
    const templates = questionTemplates.filter(
      (template) => template.category === detection.category,
    );

    for (const template of templates) {
      candidates.push({
        id: candidateId(detection, template.id),
        category: detection.category,
        templateId: template.id,
        question: template.renderer(detection),
        source: detection.source,
        targets: [...detection.targets],
        triggerTerms: [...detection.triggerTerms],
        scores: initialScores(
          detection,
          template.diagnosticityPrior,
          template.followupabilityPrior,
        ),
        followupRoutes: [...template.followupRoutes],
      });
    }
  }

  return candidates;
}
