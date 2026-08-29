import type {
  ChallengeCategory,
  Detection,
  FollowupRoute,
} from "../domain/types";

export type QuestionTemplate = {
  id: string;
  category: ChallengeCategory;
  renderer: (detection: Detection) => string;
  diagnosticityPrior: number;
  followupabilityPrior: number;
  followupRoutes: FollowupRoute[];
};

function target(detection: Detection, index: number, fallback = "这段表述") {
  return detection.targets[index]?.trim() || fallback;
}

function trigger(detection: Detection, fallback = "这里的连接") {
  const terms = detection.triggerTerms.filter(Boolean);
  return terms.length > 0 ? terms.map((term) => `“${term}”`).join(" / ") : fallback;
}

function compactTargets(detection: Detection) {
  const items = detection.targets.map((item) => item.trim()).filter(Boolean);
  if (items.length > 0) {
    return items.slice(0, 4).map((item) => `“${item}”`).join("、");
  }

  const text = detection.source.text.trim().replace(/\s+/g, " ");
  return `“${text.slice(0, 36)}${text.length > 36 ? "…" : ""}”`;
}

const priors: Record<ChallengeCategory, { diagnosticity: number; followupability: number }> = {
  causal_gap: { diagnosticity: 0.9, followupability: 0.95 },
  definition_boundary: { diagnosticity: 0.85, followupability: 0.85 },
  evidence_jump: { diagnosticity: 0.9, followupability: 0.9 },
  comparison_compression: { diagnosticity: 0.8, followupability: 0.8 },
  list_structure: { diagnosticity: 0.7, followupability: 0.65 },
  summary_compression: { diagnosticity: 0.85, followupability: 0.85 },
};

function template(
  id: string,
  category: ChallengeCategory,
  followupRoutes: FollowupRoute[],
  renderer: (detection: Detection) => string,
): QuestionTemplate {
  return {
    id,
    category,
    renderer,
    diagnosticityPrior: priors[category].diagnosticity,
    followupabilityPrior: priors[category].followupability,
    followupRoutes,
  };
}

export const questionTemplates: QuestionTemplate[] = [
  template(
    "causal-gap-mechanism",
    "causal_gap",
    ["mechanism", "evidence", "boundary"],
    (detection) =>
      `${trigger(detection)}把“${target(detection, 0)}”到“${target(detection, 1, "结果")}”之间压掉了哪些中间机制？`,
  ),
  template(
    "causal-gap-alternative-cause",
    "causal_gap",
    ["alternative_cause", "evidence", "boundary"],
    (detection) =>
      `除了“${target(detection, 0)}”，还有什么原因也可能造成“${target(detection, 1, "这个结果")}”？怎么区分？`,
  ),
  template(
    "definition-boundary-boundary",
    "definition_boundary",
    ["boundary", "necessary_condition", "counterexample"],
    (detection) =>
      `按这里${trigger(detection)}的说法，“${target(detection, 0)}”在什么边界条件下不再算“${target(detection, 1, "这个定义")}”？`,
  ),
  template(
    "definition-boundary-counterexample",
    "definition_boundary",
    ["counterexample", "boundary", "necessary_condition"],
    (detection) =>
      `什么东西看起来像“${target(detection, 0)}”，但其实落在这里${trigger(detection)}的边界外？`,
  ),
  template(
    "evidence-jump-evidence",
    "evidence_jump",
    ["evidence", "necessary_condition", "boundary"],
    (detection) =>
      `${trigger(detection)}这一步，哪条具体证据最能把“${target(detection, 0)}”推到“${target(detection, 1, "这个结论")}”？`,
  ),
  template(
    "evidence-jump-alternative-explanation",
    "evidence_jump",
    ["evidence", "alternative_cause", "counterexample"],
    (detection) =>
      `同样面对“${target(detection, 0)}”，还有什么解释也符合现有证据，却不必得到“${target(detection, 1, "这个结论")}”？`,
  ),
  template(
    "comparison-compression-dimension",
    "comparison_compression",
    ["comparison_dimension", "boundary", "evidence"],
    (detection) =>
      `“${target(detection, 0)}”和“${target(detection, 1, "另一个对象")}”到底在哪个维度上得到“${target(detection, 2, trigger(detection))}”这个比较？`,
  ),
  template(
    "comparison-compression-boundary",
    "comparison_compression",
    ["boundary", "comparison_dimension", "counterexample"],
    (detection) =>
      `什么条件会让这里${trigger(detection)}表达的比较反转？具体落在${compactTargets(detection)}中的哪一项？`,
  ),
  template(
    "list-structure-organizing-principle",
    "list_structure",
    ["organizing_principle", "necessary_condition", "boundary"],
    (detection) =>
      `${compactTargets(detection)}为什么属于同一组？把它们放在一起的组织原则是什么？`,
  ),
  template(
    "list-structure-missing-boundary",
    "list_structure",
    ["boundary", "organizing_principle", "counterexample"],
    (detection) =>
      `按${compactTargets(detection)}这组条目的边界，还缺哪一种类型，才能检验这个列表是不是漏了东西？`,
  ),
  template(
    "summary-compression-mechanism",
    "summary_compression",
    ["mechanism", "necessary_condition", "evidence"],
    (detection) =>
      `${trigger(detection)}把“${target(detection, 0, detection.source.text.trim())}”前面的哪些中间步骤或必要条件压掉了？`,
  ),
  template(
    "summary-compression-boundary",
    "summary_compression",
    ["counterexample", "boundary", "alternative_cause"],
    (detection) =>
      `什么情况会让“${target(detection, 0, detection.source.text.trim())}”这个总结失效，而不是只让它变得不够漂亮？`,
  ),
];
