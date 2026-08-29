import { describe, expect, it } from "vitest";
import type { ChallengeCategory, NoteContext } from "../../src/domain/types";
import { detectPatterns } from "../../src/detection/pattern-detector";

function context(text: string): NoteContext {
  return {
    notePath: "notes/example.md",
    heading: "机制",
    from: 120,
    to: 120 + text.length,
    text,
    scope: "section",
  };
}

function findCategory(text: string, category: ChallengeCategory) {
  return detectPatterns(context(text)).find((item) => item.category === category);
}

describe("detectPatterns", () => {
  it("detects an explicit paired causal structure with high confidence", () => {
    const detection = findCategory(
      "因为温度升高会加快反应，所以产物生成速度上升。",
      "causal_gap",
    );

    expect(detection?.confidence).toBeGreaterThanOrEqual(0.9);
    expect(detection?.triggerTerms).toEqual(expect.arrayContaining(["因为", "所以"]));
    expect(detection?.targets.length).toBeGreaterThan(0);
  });

  it("detects a single strong causal marker with medium-high confidence", () => {
    const detection = findCategory("温度升高导致反应速度增加。", "causal_gap");

    expect(detection?.confidence).toBeGreaterThanOrEqual(0.7);
    expect(detection?.confidence).toBeLessThan(0.9);
    expect(detection?.triggerTerms).toContain("导致");
  });

  it.each([
    ["注意力是有限的认知资源。", "是"],
    ["熵增意味着可用能量减少。", "意味着"],
    ["这个概念本质上是一种边界约束。", "本质上"],
    ["缓存命中率定义为命中次数除以访问次数。", "定义为"],
  ])("detects definition compression: %s", (text, trigger) => {
    const detection = findCategory(text, "definition_boundary");

    expect(detection?.confidence).toBeGreaterThanOrEqual(0.7);
    expect(detection?.triggerTerms).toContain(trigger);
    expect(detection?.targets.length).toBeGreaterThan(0);
  });

  it.each(["但是这个方案还需要验证。", "我们需要确认是否存在缓存。"])(
    "does not treat 是 inside another word as a definition trigger: %s",
    (text) => {
      expect(findCategory(text, "definition_boundary")).toBeUndefined();
    },
  );

  it.each([
    ["这个实验结果说明温度不是唯一变量。", "说明"],
    ["数据表明误差随规模增加。", "表明"],
    ["这组观测证明模型在该条件下失效。", "证明"],
    ["误差只在高负载出现，这意味着瓶颈在竞争资源。", "这意味着"],
  ])("detects an evidence-to-conclusion jump: %s", (text, trigger) => {
    const detection = findCategory(text, "evidence_jump");

    expect(detection?.confidence).toBeGreaterThanOrEqual(0.7);
    expect(detection?.triggerTerms).toContain(trigger);
  });

  it.each([
    ["A 比 B 更稳定。", ["比", "更"]],
    ["相比旧方案，新方案延迟更低。", ["相比", "更"]],
    ["这个实现较原版简单。", ["较"]],
    ["事件驱动不同于轮询。", ["不同于"]],
  ])("detects compressed comparison relations: %s", (text, triggers) => {
    const detection = findCategory(text, "comparison_compression");

    expect(detection?.confidence).toBeGreaterThanOrEqual(0.7);
    expect(detection?.triggerTerms).toEqual(expect.arrayContaining(triggers));
  });

  it.each([
    "比如这个例子只用于说明接口。",
    "更新缓存之后重新读取。",
    "这个实现比较复杂，需要拆分。",
  ])("does not treat weak comparison substrings as explicit comparison: %s", (text) => {
    expect(findCategory(text, "comparison_compression")).toBeUndefined();
  });

  it("detects Markdown bullet-list structure", () => {
    const detection = findCategory(
      "系统有三个约束：\n- 低延迟\n- 可恢复\n- 可观察",
      "list_structure",
    );

    expect(detection?.confidence).toBeGreaterThanOrEqual(0.8);
    expect(detection?.triggerTerms.length).toBeGreaterThan(0);
    expect(detection?.targets).toEqual(
      expect.arrayContaining(["低延迟", "可恢复", "可观察"]),
    );
  });

  it("detects Markdown numbered-list structure", () => {
    const detection = findCategory(
      "处理步骤：\n1. 读取上下文\n2. 检测结构\n3. 生成候选",
      "list_structure",
    );

    expect(detection?.confidence).toBeGreaterThanOrEqual(0.8);
    expect(detection?.targets).toHaveLength(3);
  });

  it("does not mistake ordinary consecutive sentences for a list", () => {
    const detection = findCategory(
      "系统读取当前段落。随后计算结构信号。最后返回结果。",
      "list_structure",
    );

    expect(detection).toBeUndefined();
  });

  it.each([
    ["总的来说，这个方案用空间换时间。", "总的来说"],
    ["归根结底，问题来自共享状态。", "归根结底"],
    ["本质上，这仍然是资源竞争。", "本质上"],
    ["从这些结果可以看出，瓶颈集中在写路径。", "可以看出"],
  ])("detects summary compression: %s", (text, trigger) => {
    const detection = findCategory(text, "summary_compression");

    expect(detection?.confidence).toBeGreaterThanOrEqual(0.7);
    expect(detection?.triggerTerms).toContain(trigger);
  });

  it("returns no detections for ordinary text without obvious structure", () => {
    const detections = detectPatterns(
      context("叶片吸收光线。细胞内发生一系列反应。产物随后被运输到其他组织。"),
    );

    expect(detections).toEqual([]);
  });

  it("preserves the input NoteContext including absolute offsets", () => {
    const source = context("温度升高导致反应速度增加。");
    const detection = detectPatterns(source).find((item) => item.category === "causal_gap");

    expect(detection?.source).toEqual(source);
    expect(detection?.source.from).toBe(120);
    expect(detection?.source.to).toBe(120 + source.text.length);
  });

  it("reports only trigger terms that actually occur in the source text", () => {
    const source = context("相比旧方案，新方案更稳定。");
    const detection = detectPatterns(source).find(
      (item) => item.category === "comparison_compression",
    );

    expect(detection?.triggerTerms.length).toBeGreaterThan(0);
    for (const term of detection?.triggerTerms ?? []) {
      expect(source.text).toContain(term);
    }
  });
});
