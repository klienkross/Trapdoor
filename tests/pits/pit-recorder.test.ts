import { describe, expect, it } from "vitest";
import { requestChallenge } from "../../src/challenge/challenge-service";
import type { QuestionCandidate } from "../../src/domain/types";
import { FeedbackStore } from "../../src/feedback/feedback-store";
import { buildPitCallout, insertPit } from "../../src/pits/pit-recorder";

function candidate(overrides: Partial<QuestionCandidate> = {}): QuestionCandidate {
  const source = overrides.source ?? {
    notePath: "notes/a.md",
    heading: "当前",
    from: 0,
    to: 0,
    text: "",
    scope: "section" as const,
  };

  return {
    id: "pit-candidate",
    category: "causal_gap",
    templateId: "causal-gap-01",
    question: "question",
    targets: ["X", "Y"],
    triggerTerms: ["导致"],
    scores: {
      structure: 0.8,
      centrality: 0.5,
      diagnosticity: 0.9,
      followupability: 0.95,
      novelty: 1,
      repetitionPenalty: 0,
      dislikePenalty: 0,
      explorationPenalty: 0,
      final: 0.8,
    },
    followupRoutes: ["mechanism"],
    ...overrides,
    source,
  };
}

describe("buildPitCallout", () => {
  it("builds the fixed Obsidian question callout", () => {
    expect(buildPitCallout(candidate())).toBe(
      "> [!question] 认知坑\n> question\n",
    );
  });

  it("preserves a Chinese question exactly", () => {
    const question = "“导致”这两个字省掉了哪两步？";
    expect(buildPitCallout(candidate({ question }))).toBe(
      `> [!question] 认知坑\n> ${question}\n`,
    );
  });

  it("quotes every line of a multiline question", () => {
    const question = "第一行？\n第二行。\n第三行！";
    expect(buildPitCallout(candidate({ question }))).toBe(
      "> [!question] 认知坑\n> 第一行？\n> 第二行。\n> 第三行！\n",
    );
  });
});

describe("insertPit", () => {
  it("inserts a section pit at the source section end", () => {
    const markdown = "## 当前\n正文";
    const item = candidate({
      source: {
        notePath: "notes/a.md",
        heading: "当前",
        from: 0,
        to: markdown.length,
        text: markdown,
        scope: "section",
      },
    });

    expect(insertPit(markdown, item)).toBe(
      "## 当前\n正文\n\n> [!question] 认知坑\n> question\n",
    );
  });

  it("keeps a pit before the next same-level heading when source.to points at it", () => {
    const markdown = "## 当前\n正文\n\n## 下一节\n后文";
    const boundary = markdown.indexOf("## 下一节");
    const item = candidate({
      source: {
        notePath: "notes/a.md",
        heading: "当前",
        from: 0,
        to: boundary,
        text: markdown.slice(0, boundary),
        scope: "section",
      },
    });

    const result = insertPit(markdown, item);
    expect(result.indexOf("> [!question] 认知坑")).toBeLessThan(result.indexOf("## 下一节"));
  });

  it("does not damage a later heading or its content", () => {
    const suffix = "## 下一节\n后文 **保持原样**\n- item";
    const markdown = `## 当前\n正文\n\n${suffix}`;
    const boundary = markdown.indexOf("## 下一节");
    const item = candidate({
      source: {
        notePath: "notes/a.md",
        heading: "当前",
        from: 0,
        to: boundary,
        text: markdown.slice(0, boundary),
        scope: "section",
      },
    });

    expect(insertPit(markdown, item).endsWith(suffix)).toBe(true);
  });

  it("inserts a whole-note pit at note end", () => {
    const markdown = "# Note\nBody";
    const item = candidate({
      source: {
        notePath: "notes/a.md",
        heading: null,
        from: 0,
        to: markdown.length,
        text: markdown,
        scope: "note",
      },
    });

    expect(insertPit(markdown, item)).toBe(
      "# Note\nBody\n\n> [!question] 认知坑\n> question\n",
    );
  });

  it("inserts a whole-note pit at the current note end when source.to is stale", () => {
    const markdown = "old\nnew content";
    const item = candidate({
      source: {
        notePath: "notes/a.md",
        heading: null,
        from: 0,
        to: 4,
        text: "old\n",
        scope: "note",
      },
    });

    expect(insertPit(markdown, item)).toBe(
      "old\nnew content\n\n> [!question] 认知坑\n> question\n",
    );
  });

  it("adds readable spacing when markdown has no trailing newline", () => {
    const markdown = "正文";
    const item = candidate({
      source: { notePath: "notes/a.md", heading: null, from: 0, to: 2, text: markdown, scope: "note" },
    });
    expect(insertPit(markdown, item)).toBe(
      "正文\n\n> [!question] 认知坑\n> question\n",
    );
  });

  it("uses an existing trailing newline without changing original bytes", () => {
    const markdown = "正文\n";
    const item = candidate({
      source: { notePath: "notes/a.md", heading: null, from: 0, to: 3, text: markdown, scope: "note" },
    });
    expect(insertPit(markdown, item)).toBe(
      "正文\n\n> [!question] 认知坑\n> question\n",
    );
  });

  it.each([-12, 999])("falls back deterministically to note end for out-of-range source.to=%s", (to) => {
    const markdown = "## 当前\n正文\n\n## 下一节\n后文";
    const item = candidate({
      source: { notePath: "notes/a.md", heading: "当前", from: 0, to, text: "stale", scope: "section" },
    });

    expect(() => insertPit(markdown, item)).not.toThrow();
    expect(insertPit(markdown, item)).toBe(
      `${markdown}\n\n> [!question] 认知坑\n> question\n`,
    );
  });

  it("handles an empty note", () => {
    const item = candidate({
      source: { notePath: "notes/empty.md", heading: null, from: 0, to: 0, text: "", scope: "note" },
    });
    expect(insertPit("", item)).toBe("> [!question] 认知坑\n> question\n");
  });

  it("handles an empty section at a heading boundary", () => {
    const markdown = "## 空节\n## 下一节\n正文";
    const boundary = markdown.indexOf("## 下一节");
    const item = candidate({
      source: {
        notePath: "notes/a.md",
        heading: "空节",
        from: 0,
        to: boundary,
        text: markdown.slice(0, boundary),
        scope: "section",
      },
    });

    expect(insertPit(markdown, item)).toBe(
      "## 空节\n\n> [!question] 认知坑\n> question\n\n## 下一节\n正文",
    );
  });

  it("does not duplicate the same exact pit already adjacent to the target", () => {
    const original = "## 当前\n正文\n\n## 下一节\n后文";
    const boundary = original.indexOf("## 下一节");
    const item = candidate({
      source: {
        notePath: "notes/a.md",
        heading: "当前",
        from: 0,
        to: boundary,
        text: original.slice(0, boundary),
        scope: "section",
      },
    });
    const once = insertPit(original, item);

    expect(insertPit(once, item)).toBe(once);
  });

  it("keeps original markdown byte-for-byte outside the insertion", () => {
    const markdown = "αβ\r\n## 当前\r\nbody  \r\n\r\n## Next\r\n尾巴";
    const boundary = markdown.indexOf("## Next");
    const item = candidate({
      source: {
        notePath: "notes/a.md",
        heading: "当前",
        from: markdown.indexOf("## 当前"),
        to: boundary,
        text: markdown.slice(markdown.indexOf("## 当前"), boundary),
        scope: "section",
      },
    });
    const result = insertPit(markdown, item);
    const calloutIndex = result.indexOf("> [!question] 认知坑");

    expect(result.slice(0, boundary)).toBe(markdown.slice(0, boundary));
    expect(result.slice(result.indexOf("## Next", calloutIndex))).toBe(markdown.slice(boundary));
  });

  it("does not mutate the candidate", () => {
    const markdown = "正文";
    const item = candidate({
      question: "原问题？",
      source: { notePath: "notes/a.md", heading: null, from: 0, to: 2, text: markdown, scope: "note" },
    });
    const before = structuredClone(item);

    insertPit(markdown, item);

    expect(item).toEqual(before);
  });

  it("has no FeedbackStore counter or history side effects", () => {
    const store = new FeedbackStore();
    const markdown = "正文";
    const item = candidate({
      source: { notePath: "notes/a.md", heading: null, from: 0, to: 2, text: markdown, scope: "note" },
    });
    const beforeCategory = store.getCategoryStats(item.category);
    const beforeTemplate = store.getTemplateStats(item.templateId);

    insertPit(markdown, item);

    expect(store.getRecentHistory()).toEqual([]);
    expect(store.getRecentShownHistory()).toEqual([]);
    expect(store.getCategoryStats(item.category)).toEqual(beforeCategory);
    expect(store.getTemplateStats(item.templateId)).toEqual(beforeTemplate);
  });

  it("accepts the real QuestionCandidate shape returned by Task 8", () => {
    const markdown = [
      "# 笔记",
      "",
      "## 当前",
      "注意力资源有限，所以筛选会导致部分信息无法进入后续加工。",
      "",
      "## 下一节",
      "普通补充。",
    ].join("\n");
    const result = requestChallenge({
      markdown,
      cursorOffset: markdown.indexOf("注意力"),
      notePath: "notes/integration.md",
      feedbackStore: new FeedbackStore(),
    });

    expect(result.status).toBe("question");
    if (result.status !== "question") return;

    const updated = insertPit(markdown, result.candidate);
    expect(updated).toContain(buildPitCallout(result.candidate));
    expect(updated.indexOf(buildPitCallout(result.candidate))).toBeLessThan(updated.indexOf("## 下一节"));
  });
});
