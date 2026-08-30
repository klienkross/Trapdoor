import { describe, expect, it } from "vitest";
import type { ChallengeCategory, NoteContext } from "../../src/domain/types";
import { detectPatterns } from "../../src/detection/pattern-detector";
import { generateCandidates } from "../../src/generation/question-generator";

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

function candidates(text: string) {
  return generateCandidates(detectPatterns(context(text)));
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
    ["这个方案是临时实现。", "是"],
    ["熵增意味着可用能量减少。", "意味着"],
    ["这个概念本质上是一种边界约束。", "本质上"],
    ["缓存命中率定义为命中次数除以访问次数。", "定义为"],
  ])("detects definition compression: %s", (text, trigger) => {
    const detection = findCategory(text, "definition_boundary");

    expect(detection?.confidence).toBeGreaterThanOrEqual(0.7);
    expect(detection?.triggerTerms).toContain(trigger);
    expect(detection?.targets.length).toBeGreaterThan(0);
  });

  it.each([
    "但是这个方案还需要验证。",
    "我们需要确认是否存在缓存。",
    "只是一个临时方案。",
    "于是系统重新尝试。",
    "这个值总是在变化。",
    "还是需要继续验证。",
    "我们还是需要继续验证。",
    "这个方案还是不够稳定。",
    "他们还是决定回滚。",
  ])("does not treat non-copular 是 as a definition trigger: %s", (text) => {
    expect(findCategory(text, "definition_boundary")).toBeUndefined();
  });

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
    "比例发生变化。",
    "比方说这个例子。",
    "这个人有点较真。",
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

  it("does not extract challenge patterns from fenced Dataview or ordinary code", () => {
    const text = [
      "```dataview",
      "LIST",
      "- A 比 B 更稳定",
      "- 因为查询命中所以显示结果",
      "```",
      "```ts",
      "const reason = '因为缓存失效所以重算';",
      "```",
    ].join("\n");

    expect(detectPatterns(context(text))).toEqual([]);
  });

  it("keeps prose candidates free of fenced Dataview tokens", () => {
    const text = [
      "温度升高导致反应速度增加。",
      "",
      "```dataview",
      "LIST",
      "- A 比 B 更稳定",
      "- 因为查询命中所以显示结果",
      "```",
    ].join("\n");

    const generated = candidates(text);
    expect(generated.some((candidate) => candidate.category === "causal_gap")).toBe(true);
    for (const candidate of generated) {
      expect(candidate.targets.join(" ")).not.toMatch(/Dataview|LIST|查询命中|显示结果|A 比 B/iu);
      expect(candidate.question).not.toMatch(/Dataview|LIST|查询命中|显示结果|A 比 B/iu);
    }
  });

  it("excludes question-ending sentences from challenge extraction", () => {
    const text = [
      "印象里这类的分解主要是用于乘法简化运算。",
      "为什么说是无监督学习方法呢？",
      "只是因为用到了吗？",
    ].join("\n");

    const generated = candidates(text);
    expect(generated).toEqual([]);
  });

  it("still extracts a declarative causal sentence beside a question", () => {
    const text = "为什么 A 会发生？\n我认为主要是 B 导致的，因为 C。";
    const causal = findCategory(text, "causal_gap");

    expect(causal).toBeDefined();
    expect(causal?.targets.join(" ")).not.toContain("为什么 A 会发生");
  });

  it("treats Chinese ellipsis as a sentence boundary for causal targets", () => {
    const text = "码的好处就是写的太烂就会跑不起来，跑不起来一切免谈，所以在客观事实面前人类暂时合作了……艺术什么的就灵活的多，竞争性会很强的样子";
    const causal = findCategory(text, "causal_gap");

    expect(causal).toBeDefined();
    expect(causal?.targets.join(" ")).not.toContain("艺术什么的");
  });

  it("treats ASCII ellipsis as a sentence boundary for causal targets", () => {
    const text = "缓存失效所以需要重算...艺术什么的另说";
    const causal = findCategory(text, "causal_gap");

    expect(causal).toBeDefined();
    expect(causal?.targets.join(" ")).not.toContain("艺术什么的");
  });

  it("never emits half-parenthetical causal targets from the CCD smoke text", () => {
    const text = "CCD讲了很多关于噪声的内容，比如散列噪声、暗电流（所以需要制冷），细节见图";
    const causal = findCategory(text, "causal_gap");

    if (!causal) return;

    for (const target of causal.targets) {
      expect(target).not.toMatch(/[（(]\s*$/u);
      expect(target).not.toMatch(/^[^（(]*[）)]/u);
    }
    expect(causal.targets.join(" ")).not.toContain("需要制冷），细节见图");
  });

  it("does not treat rhetorical 不是/只是…而是 contrast as a definition", () => {
    const text = "它不再只是“像”网络暴力，而是直接揭示网络暴力可能就是某种宇宙中通行的、可以被量化和研究的“信息病理学”的一种表现。";

    expect(findCategory(text, "definition_boundary")).toBeUndefined();
  });
});
