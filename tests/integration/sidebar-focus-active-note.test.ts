import { describe, expect, it, vi } from "vitest";
import type { MarkdownView } from "obsidian";

import { ObsidianActiveNoteAdapter } from "../../src/app/obsidian-active-note-adapter";

function fakeMarkdownView(
  path: string,
  getMarkdown: () => string,
  setMarkdown: (value: string) => void,
  cursorOffset: number,
): MarkdownView {
  return {
    file: { path },
    editor: {
      getValue: getMarkdown,
      getCursor: () => ({ line: 0, ch: cursorOffset }),
      posToOffset: () => cursorOffset,
      setValue: setMarkdown,
    },
  } as unknown as MarkdownView;
}

describe("manual smoke: sidebar focus keeps the Markdown source", () => {
  it("returns the still-open A.md after the Trapdoor sidebar takes focus", () => {
    let markdown = "# A\nX 导致 Y。";
    const aView = fakeMarkdownView("A.md", () => markdown, (value) => { markdown = value; }, 6);
    let activeMarkdownView: MarkdownView | null = aView;
    let openMarkdownViews: MarkdownView[] = [aView];
    const workspace = {
      getActiveViewOfType: vi.fn(() => activeMarkdownView),
      getLeavesOfType: vi.fn(() => openMarkdownViews.map((view) => ({ view }))),
    };
    const adapter = new ObsidianActiveNoteAdapter({ workspace } as never);

    expect(adapter.getActiveNote()).toEqual({
      markdown: "# A\nX 导致 Y。",
      cursorOffset: 6,
      notePath: "A.md",
    });

    activeMarkdownView = null;
    expect(adapter.getActiveNote()).toEqual({
      markdown: "# A\nX 导致 Y。",
      cursorOffset: 6,
      notePath: "A.md",
    });

    openMarkdownViews = [];
    expect(adapter.getActiveNote()).toBeNull();
  });

  it("replaceMarkdown writes back to the resolved A.md while the sidebar has focus", () => {
    let markdown = "# A\nX 导致 Y。";
    const aView = fakeMarkdownView("A.md", () => markdown, (value) => { markdown = value; }, 6);
    let activeMarkdownView: MarkdownView | null = aView;
    const workspace = {
      getActiveViewOfType: vi.fn(() => activeMarkdownView),
      getLeavesOfType: vi.fn(() => [{ view: aView }]),
    };
    const adapter = new ObsidianActiveNoteAdapter({ workspace } as never);

    expect(adapter.getActiveNote()?.notePath).toBe("A.md");
    activeMarkdownView = null;

    expect(() => adapter.replaceMarkdown("# A\nchanged")).not.toThrow();
    expect(markdown).toBe("# A\nchanged");
  });

  it("updates the remembered source when a different Markdown note becomes active", () => {
    let aMarkdown = "# A\nX 导致 Y。";
    let bMarkdown = "# B\nP 导致 Q。";
    const aView = fakeMarkdownView("A.md", () => aMarkdown, (value) => { aMarkdown = value; }, 4);
    const bView = fakeMarkdownView("B.md", () => bMarkdown, (value) => { bMarkdown = value; }, 5);
    let activeMarkdownView: MarkdownView | null = aView;
    const workspace = {
      getActiveViewOfType: vi.fn(() => activeMarkdownView),
      getLeavesOfType: vi.fn(() => [{ view: aView }, { view: bView }]),
    };
    const adapter = new ObsidianActiveNoteAdapter({ workspace } as never);

    expect(adapter.getActiveNote()?.notePath).toBe("A.md");
    activeMarkdownView = bView;
    expect(adapter.getActiveNote()).toEqual({
      markdown: bMarkdown,
      cursorOffset: 5,
      notePath: "B.md",
    });
  });
});
