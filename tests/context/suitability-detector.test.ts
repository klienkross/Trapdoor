import { describe, expect, it } from "vitest";
import {
  EXPLORATION_SKIP_THRESHOLD,
  measureExploration,
} from "../../src/context/suitability-detector";

describe("measureExploration", () => {
  it("does not misclassify an ordinary declarative note", () => {
    const result = measureExploration(
      "光合作用把光能转化为化学能。叶绿体中的反应形成有机物，并释放氧气。",
    );

    expect(result.score).toBe(0);
    expect(result.signals).toEqual([]);
    expect(result.shouldSkip).toBe(false);
  });

  it("treats high question-mark density as strong exploration", () => {
    const result = measureExploration(
      "为什么会这样？证据是什么？边界在哪？还有反例吗？替代解释呢？机制可靠吗？",
    );

    expect(result.signals.some((signal) => signal.kind === "question_mark_density")).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(EXPLORATION_SKIP_THRESHOLD);
    expect(result.shouldSkip).toBe(true);
  });

  it("reports uncertainty terms transparently", () => {
    const result = measureExploration(
      "这可能只是相关性，也许还有混杂变量。目前只是猜测，我不确定，结论待验证。",
    );
    const signal = result.signals.find((item) => item.kind === "uncertainty_terms");

    expect(signal?.matches).toEqual(
      expect.arrayContaining(["可能", "也许", "猜测", "不确定", "待验证"]),
    );
    expect(signal?.contribution).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(0);
  });

  it("detects TODO and draft markers", () => {
    const result = measureExploration("TODO: 补证据。\nDRAFT：这里还是草稿，之后重写。");
    const signal = result.signals.find((item) => item.kind === "draft_markers");

    expect(signal?.matches).toEqual(expect.arrayContaining(["TODO", "DRAFT", "草稿"]));
    expect(signal?.contribution).toBeGreaterThan(0);
  });

  it("detects multiple competing hypotheses or alternative explanations", () => {
    const result = measureExploration(
      "假设 A：是温度造成的。假设 B：也可能是湿度。另一种解释是测量偏差。",
    );
    const signal = result.signals.find((item) => item.kind === "competing_hypotheses");

    expect(signal?.matches.length).toBeGreaterThanOrEqual(2);
    expect(signal?.contribution).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(0);
  });

  it("uses the MVP skip threshold of 0.8", () => {
    expect(EXPLORATION_SKIP_THRESHOLD).toBe(0.8);

    const result = measureExploration(
      "为什么？怎么验证？TODO：待验证。也许是 A，也可能是 B。另一种解释是什么？",
    );

    expect(result.score).toBeGreaterThanOrEqual(0.8);
    expect(result.shouldSkip).toBe(result.score >= 0.8);
  });
});
