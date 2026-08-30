import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";

import type { QuestionCandidate } from "../../src/domain/types";
import {
  renderChallengeViewState,
  type ChallengeViewActions,
} from "../../src/ui/challenge-view-renderer";

function createContainer(): HTMLElement {
  const dom = new JSDOM("<!doctype html><div id=\"root\"></div>");
  return dom.window.document.querySelector("#root") as HTMLElement;
}

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const button = [...container.querySelectorAll("button")].find((item) => item.textContent === text);
  if (!button) throw new Error(`Missing button: ${text}`);
  return button as HTMLButtonElement;
}

function candidate(id = "candidate-a", question = "什么东西看起来像“爽”，但其实不满足它的定义条件？"): QuestionCandidate {
  return {
    id,
    category: "definition_boundary",
    templateId: "definition-boundary-counterexample",
    question,
    source: {
      notePath: "note.md",
      heading: "定义",
      from: 0,
      to: 12,
      text: "爽是一种状态。",
      scope: "section",
    },
    targets: ["爽", "状态"],
    triggerTerms: ["是"],
    followupRoutes: ["counterexample"],
    scores: {
      structure: 0.8,
      centrality: 0.7,
      diagnosticity: 0.9,
      followupability: 0.9,
      novelty: 1,
      repetitionPenalty: 0,
      dislikePenalty: 0,
      explorationPenalty: 0,
      final: 0.82,
    },
  };
}

function actions(overrides: Partial<ChallengeViewActions> & { copyQuestion?: (question: string) => void | Promise<void> } = {}): ChallengeViewActions & { copyQuestion: (question: string) => void | Promise<void> } {
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
    copyQuestion: vi.fn(),
    ...overrides,
  };
}

describe("sidebar question UX polish", () => {
  it("copies only the exact question text", () => {
    const container = createContainer();
    const copyQuestion = vi.fn();
    const current = candidate();
    const currentActions = actions({ copyQuestion });

    renderChallengeViewState(container, { kind: "question", candidate: current, debug: true }, currentActions);
    buttonByText(container, "复制问题").click();

    expect(copyQuestion).toHaveBeenCalledTimes(1);
    expect(copyQuestion).toHaveBeenCalledWith(current.question);
  });

  it("renders an accessible ephemeral draft textarea", () => {
    const container = createContainer();
    renderChallengeViewState(container, { kind: "question", candidate: candidate(), debug: false }, actions());

    const textarea = container.querySelector('textarea[aria-label="当前问题草稿"]') as HTMLTextAreaElement | null;
    expect(textarea).not.toBeNull();
    expect(textarea?.placeholder).toBeTruthy();
  });

  it("passes undefined for an empty draft", () => {
    const container = createContainer();
    const continueDrill = vi.fn();
    renderChallengeViewState(container, { kind: "question", candidate: candidate(), debug: false }, actions({ continueDrill }));

    buttonByText(container, "继续拷打").click();
    expect(continueDrill).toHaveBeenCalledWith(undefined);
  });

  it("trims a non-empty draft before continuing", () => {
    const container = createContainer();
    const continueDrill = vi.fn();
    renderChallengeViewState(container, { kind: "question", candidate: candidate(), debug: false }, actions({ continueDrill }));

    const textarea = container.querySelector('textarea[aria-label="当前问题草稿"]') as HTMLTextAreaElement;
    textarea.value = "   我的答案   ";
    buttonByText(container, "继续拷打").click();

    expect(continueDrill).toHaveBeenCalledWith("我的答案");
  });

  it("clears the draft when a replacement candidate is rendered", () => {
    const container = createContainer();
    const currentActions = actions();
    renderChallengeViewState(container, { kind: "question", candidate: candidate("candidate-a"), debug: false }, currentActions);

    const first = container.querySelector('textarea[aria-label="当前问题草稿"]') as HTMLTextAreaElement;
    first.value = "draft A";

    renderChallengeViewState(container, { kind: "question", candidate: candidate("candidate-b", "新的问题？"), debug: false }, currentActions);

    const second = container.querySelector('textarea[aria-label="当前问题草稿"]') as HTMLTextAreaElement;
    expect(second).not.toBe(first);
    expect(second.value).toBe("");
  });
});
