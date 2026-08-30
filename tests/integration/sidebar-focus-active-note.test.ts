import { describe, expect, it, vi } from "vitest";
import type { MarkdownView } from "obsidian";

import { createChallengeController } from "../../src/app/challenge-controller";
import { ObsidianActiveNoteAdapter } from "../../src/app/obsidian-active-note-adapter";
import type { QuestionCandidate } from "../../src/domain/types";
import { FeedbackStore } from "../../src/feedback/feedback-store";

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

function candidate(id: string, notePath: string): QuestionCandidate {
  return {
    id,
    category: "causal_gap",
    templateId: `template-${id}`,
    question: `${id}?`,
    source: {
      notePath,
      heading: "A",
      from: 0,
      to: 10,
      text: "X 导致 Y。",
      scope: "section",
    },
    targets: ["X", "Y"],
    triggerTerms: ["导致"],
    followupRoutes: ["mechanism"],
    scores: {
      structure: 1,
      centrality: 1,
      diagnosticity: 1,
      followupability: 1,
      novelty: 1,
      repetitionPenalty: 0,
      dislikePenalty: 0,
      explorationPenalty: 0,
      final: 1,
    },
  };
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

  it("requestChallenge(A) then sidebar focus then replace still requests the next local challenge from A with zero provider calls", async () => {
    let markdown = "# A\nX 导致 Y。";
    const aView = fakeMarkdownView("A.md", () => markdown, (value) => { markdown = value; }, 6);
    let activeMarkdownView: MarkdownView | null = aView;
    const workspace = {
      getActiveViewOfType: vi.fn(() => activeMarkdownView),
      getLeavesOfType: vi.fn(() => [{ view: aView }]),
    };
    const adapter = new ObsidianActiveNoteAdapter({ workspace } as never);
    const providerComplete = vi.fn(async () => "provider must not be called");
    const selectChallenge = vi.fn(({ notePath }: { notePath: string }) => ({
      status: "question" as const,
      candidate: candidate(`candidate-${selectChallenge.mock.calls.length + 1}`, notePath),
    }));
    const controller = createChallengeController({
      activeNote: adapter,
      feedbackStore: new FeedbackStore(),
      copySystem: { next: () => null },
      settings: { endpoint: "", model: "", apiKey: "", debug: false },
      provider: { complete: providerComplete },
      persistFeedback: async () => undefined,
      renderState: () => undefined,
      selectChallenge,
    });

    await controller.actions.requestChallenge();
    expect(controller.getState().currentCandidate?.source.notePath).toBe("A.md");

    activeMarkdownView = null;
    await controller.actions.replace();

    expect(selectChallenge).toHaveBeenCalledTimes(2);
    expect(selectChallenge.mock.calls[1]?.[0]).toMatchObject({ notePath: "A.md" });
    expect(controller.getState().viewState.kind).toBe("question");
    expect(controller.getState().currentCandidate?.source.notePath).toBe("A.md");
    expect(providerComplete).not.toHaveBeenCalled();
  });
});
