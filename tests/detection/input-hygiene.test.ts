import { describe, expect, it } from "vitest";
import type { ChallengeCategory, NoteContext } from "../../src/domain/types";
import { projectChallengeableProse } from "../../src/detection/challengeable-prose";
import { detectPatterns } from "../../src/detection/pattern-detector";

function context(text: string): NoteContext {
  return {
    notePath: "notes/smoke.md",
    heading: "smoke",
    from: 0,
    to: text.length,
    text,
    scope: "section",
  };
}

function findCategory(text: string, category: ChallengeCategory) {
  return detectPatterns(context(text)).find((item) => item.category === category);
}

describe("challengeable prose input hygiene", () => {
  it("masks leading YAML frontmatter without changing UTF-16 length or newlines", () => {
    const text = [
      "---",
      "source:",
      "  - 经验",
      "status:",
      "  - 成稿",
      "tags:",
      "  - 自省",
      "created: 2025-03-05",
      "---",
      "正文仍然在这里。",
    ].join("\n");

    const projected = projectChallengeableProse(text);

    expect(projected.length).toBe(text.length);
    expect(projected.match(/\n/g)?.length).toBe(text.match(/\n/g)?.length);
    expect(projected).not.toMatch(/经验|成稿|自省|source|status|tags|created/u);
    expect(projected).toContain("正文仍然在这里。");
  });

  it("does not detect list structure from YAML frontmatter metadata alone", () => {
    const text = [
      "---",
      "source:",
      "  - 经验",
      "status:",
      "  - 成稿",
      "tags:",
      "  - 自省",
      "---",
    ].join("\n");

    expect(detectPatterns(context(text))).toEqual([]);
  });

  it("uses only the real numbered list when frontmatter also contains list items", () => {
    const text = [
      "---",
      "source:",
      "  - 经验",
      "status:",
      "  - 成稿",
      "tags:",
      "  - 自省",
      "created: 2025-03-05",
      "---",
      "",
      "为什么要早起",
      "",
      "1. 因为不吃早饭会很饿",
      "2. 因为阳光对精神状态有好处",
      "3. 因为活动身体会不那么冷",
      "4. 因为实在不行也可以去图书馆摸鱼",
    ].join("\n");

    const detection = findCategory(text, "list_structure");

    expect(detection).toBeDefined();
    expect(detection?.targets).toEqual([
      "因为不吃早饭会很饿",
      "因为阳光对精神状态有好处",
      "因为活动身体会不那么冷",
      "因为实在不行也可以去图书馆摸鱼",
    ]);
    expect(detection?.targets.join(" ")).not.toMatch(/经验|成稿|自省/u);
  });
});

describe("list_structure locality", () => {
  it("never combines two independent list blocks separated by prose", () => {
    const text = [
      "- 苹果",
      "- 香蕉",
      "",
      "这是一段正文。",
      "",
      "1. 原因 A",
      "2. 原因 B",
    ].join("\n");

    const detection = findCategory(text, "list_structure");

    expect(detection).toBeDefined();
    expect(detection?.targets).not.toEqual(expect.arrayContaining(["苹果", "原因 A"]));
    const targets = detection?.targets ?? [];
    expect(
      targets.every((target) => ["苹果", "香蕉"].includes(target)) ||
        targets.every((target) => ["原因 A", "原因 B"].includes(target)),
    ).toBe(true);
  });

  it("never combines lists across a heading boundary", () => {
    const text = [
      "- 苹果",
      "- 香蕉",
      "",
      "## 原因",
      "1. 原因 A",
      "2. 原因 B",
    ].join("\n");

    const targets = findCategory(text, "list_structure")?.targets ?? [];

    expect(targets).not.toEqual(expect.arrayContaining(["苹果", "原因 A"]));
    expect(
      targets.every((target) => ["苹果", "香蕉"].includes(target)) ||
        targets.every((target) => ["原因 A", "原因 B"].includes(target)),
    ).toBe(true);
  });
});

describe("evidence_jump 可见 semantics", () => {
  it.each([
    "1904-1905年，地面和海底布设的时钟同步电缆都很粗，同步计时器随处可见。",
    "痕迹清晰可见。",
    "肉眼可见这个划痕。",
    "清晰可见。",
    "这样的装置随处可见。",
  ])("does not treat ordinary visible predicate as inference: %s", (text) => {
    expect(findCategory(text, "evidence_jump")).toBeUndefined();
  });

  it.each([
    ["由此可见，结论并非偶然。", "可见"],
    ["可见，结论并非偶然。", "可见"],
    ["可见 A 并非偶然。", "可见"],
    ["这说明 A。", "说明"],
    ["因此可以认为 A。", "可以认为"],
  ])("keeps explicit inference markers: %s", (text, trigger) => {
    const detection = findCategory(text, "evidence_jump");

    expect(detection).toBeDefined();
    expect(detection?.triggerTerms).toContain(trigger);
  });
});
