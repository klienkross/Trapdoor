import { JSDOM } from "jsdom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => ({
  ItemView: class {
    contentEl: HTMLElement;

    constructor(_leaf: unknown) {
      this.contentEl = document.createElement("div");
    }
  },
}));

import type { QuestionCandidate } from "../../src/domain/types";
import type { ChallengeViewActions } from "../../src/ui/challenge-view-renderer";
import {
  ChallengeView,
  TRAPDOOR_VIEW_TYPE,
} from "../../src/ui/challenge-view";

function makeActions(): ChallengeViewActions {
  return {
    requestChallenge: vi.fn(),
    continueDrill: vi.fn(),
    markUseful: vi.fn(),
    markCannotAnswer: vi.fn(),
    markBad: vi.fn(),
    replace: vi.fn(),
    submitDrillAnswer: vi.fn(),
    exitDrill: vi.fn(),
    returnToIdle: vi.fn(),
  };
}

function makeCandidate(): QuestionCandidate {
  return {
    id: "candidate-1",
    category: "causal_gap",
    templateId: "causal-gap-01",
    question: "“导致”省掉了哪两步？",
    source: {
      notePath: "note.md",
      heading: "机制",
      from: 0,
      to: 10,
      text: "X 导致 Y",
      scope: "section",
    },
    targets: ["X", "Y"],
    triggerTerms: ["导致"],
    scores: {
      structure: 0.8,
      centrality: 0.7,
      diagnosticity: 0.9,
      followupability: 0.9,
      novelty: 0.8,
      repetitionPenalty: 0,
      dislikePenalty: 0,
      explorationPenalty: 0,
      final: 0.82,
    },
    followupRoutes: ["mechanism"],
  };
}

describe("ChallengeView", () => {
  beforeEach(() => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>");
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: dom.window.document,
    });
  });

  it("exposes a stable Obsidian view type and display text", () => {
    const view = new ChallengeView({} as never, makeActions());

    expect(TRAPDOOR_VIEW_TYPE).toBe("trapdoor-challenge");
    expect(view.getViewType()).toBe(TRAPDOOR_VIEW_TYPE);
    expect(view.getDisplayText()).toBe("Trapdoor");
  });

  it("renders idle on open and updates from explicit state", async () => {
    const view = new ChallengeView({} as never, makeActions());

    await view.onOpen();
    expect(view.contentEl.textContent).toContain("推我下去");

    view.setState({
      kind: "question",
      candidate: makeCandidate(),
      debug: false,
    });
    expect(view.contentEl.textContent).toContain("“导致”省掉了哪两步？");
    expect(view.contentEl.textContent).not.toContain("推我下去");
  });

  it("clears owned content on close", async () => {
    const view = new ChallengeView({} as never, makeActions());

    await view.onOpen();
    expect(view.contentEl.children.length).toBeGreaterThan(0);

    await view.onClose();
    expect(view.contentEl.children).toHaveLength(0);
  });
});
