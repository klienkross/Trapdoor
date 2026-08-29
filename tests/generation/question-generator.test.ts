import { describe, expect, it } from "vitest";
import type {
  ChallengeCategory,
  Detection,
  FollowupRoute,
  NoteContext,
} from "../../src/domain/types";
import { detectPatterns } from "../../src/detection/pattern-detector";
import { generateCandidates } from "../../src/generation/question-generator";
import { questionTemplates } from "../../src/generation/templates";

const categories: ChallengeCategory[] = [
  "causal_gap",
  "definition_boundary",
  "evidence_jump",
  "comparison_compression",
  "list_structure",
  "summary_compression",
];

function source(text: string, from = 100): NoteContext {
  return {
    notePath: "notes/example.md",
    heading: "测试段落",
    from,
    to: from + text.length,
    text,
    scope: "section",
  };
}

const fixtures: Record<ChallengeCategory, Detection> = {
  causal_gap: {
    category: "causal_gap",
    confidence: 0.9,
    source: source("温度升高导致反应速度增加。", 100),
    targets: ["温度升高", "反应速度增加"],
    triggerTerms: ["导致"],
  },
  definition_boundary: {
    category: "definition_boundary",
    confidence: 0.8,
    source: source("注意力是有限的认知资源。", 200),
    targets: ["注意力", "有限的认知资源"],
    triggerTerms: ["是"],
  },
  evidence_jump: {
    category: "evidence_jump",
    confidence: 0.85,
    source: source("数据表明误差随规模增加。", 300),
    targets: ["数据", "误差随规模增加"],
    triggerTerms: ["表明"],
  },
  comparison_compression: {
    category: "comparison_compression",
    confidence: 0.8,
    source: source("相比旧方案，新方案延迟更低。", 400),
    targets: ["旧方案", "新方案", "延迟更低"],
    triggerTerms: ["相比", "更"],
  },
  list_structure: {
    category: "list_structure",
    confidence: 0.9,
    source: source("系统有三个约束：\n- 低延迟\n- 可恢复\n- 可观察", 500),
    targets: ["低延迟", "可恢复", "可观察"],
    triggerTerms: ["-"],
  },
  summary_compression: {
    category: "summary_compression",
    confidence: 0.8,
    source: source("归根结底，问题来自共享状态。", 600),
    targets: ["问题来自共享状态"],
    triggerTerms: ["归根结底"],
  },
};

describe("questionTemplates", () => {
  it("defines at least two typed local templates for every MVP category", () => {
    for (const category of categories) {
      const templates = questionTemplates.filter((template) => template.category === category);
      expect(templates.length).toBeGreaterThanOrEqual(2);
      expect(new Set(templates.map((template) => template.id)).size).toBe(templates.length);
      for (const template of templates) {
        expect(template.diagnosticityPrior).toBeGreaterThanOrEqual(0);
        expect(template.diagnosticityPrior).toBeLessThanOrEqual(1);
        expect(template.followupabilityPrior).toBeGreaterThanOrEqual(0);
        expect(template.followupabilityPrior).toBeLessThanOrEqual(1);
        expect(template.followupRoutes.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("generateCandidates", () => {
  it("generates at least two candidates for every detected category", () => {
    const candidates = generateCandidates(categories.map((category) => fixtures[category]));

    for (const category of categories) {
      const categoryCandidates = candidates.filter((candidate) => candidate.category === category);
      expect(categoryCandidates.length).toBeGreaterThanOrEqual(2);
      expect(new Set(categoryCandidates.map((candidate) => candidate.templateId)).size).toBeGreaterThanOrEqual(2);
    }
  });

  it("maps template ids and follow-up routes from the selected template", () => {
    const candidates = generateCandidates([fixtures.causal_gap]);

    for (const candidate of candidates) {
      const template = questionTemplates.find((item) => item.id === candidate.templateId);
      expect(template).toBeDefined();
      expect(candidate.category).toBe(template?.category);
      expect(candidate.followupRoutes).toEqual(template?.followupRoutes as FollowupRoute[]);
    }
  });

  it("preserves source, targets, and trigger terms from each detection", () => {
    const detection = fixtures.comparison_compression;
    const candidates = generateCandidates([detection]);

    for (const candidate of candidates) {
      expect(candidate.source).toEqual(detection.source);
      expect(candidate.targets).toEqual(detection.targets);
      expect(candidate.triggerTerms).toEqual(detection.triggerTerms);
    }
  });

  it("renders questions from detected content instead of a fixed generic prompt", () => {
    const first = fixtures.causal_gap;
    const second: Detection = {
      ...first,
      source: source("缓存命中导致磁盘读取减少。", 700),
      targets: ["缓存命中", "磁盘读取减少"],
      triggerTerms: ["导致"],
    };

    const firstQuestions = generateCandidates([first]).map((candidate) => candidate.question);
    const secondQuestions = generateCandidates([second]).map((candidate) => candidate.question);

    expect(firstQuestions).not.toEqual(secondQuestions);
    expect(firstQuestions.some((question) => question.includes("温度升高") || question.includes("反应速度增加") || question.includes("导致"))).toBe(true);
    expect(secondQuestions.some((question) => question.includes("缓存命中") || question.includes("磁盘读取减少") || question.includes("导致"))).toBe(true);
  });

  it.each([
    "相比旧方案，新方案延迟更低。",
    "A 比 B 更稳定。",
  ])("renders comparison questions from real Task 4 detection output: %s", (text) => {
    const detections = detectPatterns(source(text, 800)).filter(
      (detection) => detection.category === "comparison_compression",
    );
    expect(detections).toHaveLength(1);

    const questions = generateCandidates(detections).map((candidate) => candidate.question);

    expect(questions).toHaveLength(2);
    for (const question of questions) {
      expect(question).not.toContain("另一个对象");
      expect(question).not.toContain("““");
      expect(question).not.toContain("””");
    }
    expect(questions.some((question) => question.includes("维度"))).toBe(true);
    expect(questions.some((question) => question.includes("条件") && question.includes("反转"))).toBe(true);
    expect(questions.every((question) => text.replace(/。$/, "").split(/[，,]/).some((part) => question.includes(part.trim())))).toBe(true);
  });

  it("uses transparent Task 5 priors without performing final ranking", () => {
    const detection = fixtures.evidence_jump;
    const candidate = generateCandidates([detection])[0];
    const template = questionTemplates.find((item) => item.id === candidate.templateId)!;

    expect(candidate.scores.structure).toBe(detection.confidence);
    expect(candidate.scores.diagnosticity).toBe(template.diagnosticityPrior);
    expect(candidate.scores.followupability).toBe(template.followupabilityPrior);
    expect(candidate.scores.centrality).toBe(0);
    expect(candidate.scores.novelty).toBe(0);
    expect(candidate.scores.repetitionPenalty).toBe(0);
    expect(candidate.scores.dislikePenalty).toBe(0);
    expect(candidate.scores.explorationPenalty).toBe(0);
    expect(candidate.scores.final).toBe(0);
  });

  it("returns stable deterministic output for the same detections", () => {
    const detections = categories.map((category) => fixtures[category]);

    expect(generateCandidates(detections)).toEqual(generateCandidates(detections));
  });

  it("returns an empty array for no detections", () => {
    expect(generateCandidates([])).toEqual([]);
  });

  it("does not require fetch or any LLM dependency", () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (() => {
      calls += 1;
      throw new Error("network access is forbidden during local generation");
    }) as typeof fetch;

    try {
      expect(() => generateCandidates([fixtures.summary_compression])).not.toThrow();
      expect(calls).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
