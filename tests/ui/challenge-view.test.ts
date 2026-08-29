import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";

import type { DrillTurn, QuestionCandidate } from "../../src/domain/types";
import {
  renderChallengeViewState,
  type ChallengeViewActions,
  type ChallengeViewState,
} from "../../src/ui/challenge-view-renderer";

function createContainer(): HTMLElement {
  const dom = new JSDOM("<!doctype html><div id=\"root\"></div>");
  return dom.window.document.querySelector("#root") as HTMLElement;
}

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const button = [...container.querySelectorAll("button")].find(
    (item) => item.textContent === text,
  );
  if (!button) {
    throw new Error(`Missing button: ${text}`);
  }
  return button as HTMLButtonElement;
}

function makeActions(
  overrides: Partial<ChallengeViewActions> = {},
): ChallengeViewActions {
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
    ...overrides,
  };
}

function makeCandidate(
  overrides: Partial<QuestionCandidate> = {},
): QuestionCandidate {
  return {
    id: "candidate-1",
    category: "causal_gap",
    templateId: "causal-gap-01",
    question: "“导致”这两个字省掉了哪两步？",
    source: {
      notePath: "note.md",
      heading: "机制",
      from: 10,
      to: 30,
      text: "X 导致 Y。",
      scope: "section",
    },
    targets: ["X", "Y"],
    triggerTerms: ["导致"],
    scores: {
      structure: 0.8,
      centrality: 0.7,
      diagnosticity: 0.9,
      followupability: 0.95,
      novelty: 0.6,
      repetitionPenalty: 0.1,
      dislikePenalty: 0.2,
      explorationPenalty: 0.05,
      final: 0.72,
    },
    followupRoutes: ["mechanism", "evidence"],
    ...overrides,
  };
}

describe("sidebar challenge view renderer", () => {
  it("renders the idle primary CTA and calls requestChallenge once", () => {
    const container = createContainer();
    const actions = makeActions();

    renderChallengeViewState(container, { kind: "idle" }, actions);

    const button = buttonByText(container, "推我下去");
    expect(button.classList.contains("trapdoor-primary-action")).toBe(true);
    button.click();
    expect(actions.requestChallenge).toHaveBeenCalledTimes(1);
  });

  it("re-rendering replaces old nodes instead of accumulating listeners", () => {
    const container = createContainer();
    const actions = makeActions();

    renderChallengeViewState(container, { kind: "idle" }, actions);
    const oldButton = buttonByText(container, "推我下去");
    renderChallengeViewState(container, { kind: "idle" }, actions);
    const newButton = buttonByText(container, "推我下去");

    expect(newButton).not.toBe(oldButton);
    newButton.click();
    expect(actions.requestChallenge).toHaveBeenCalledTimes(1);
  });

  it("renders exactly one question with five distinct actions", () => {
    const container = createContainer();
    const actions = makeActions();
    const candidate = makeCandidate();

    renderChallengeViewState(
      container,
      { kind: "question", candidate, debug: false },
      actions,
    );

    expect(container.querySelectorAll(".trapdoor-question-text")).toHaveLength(1);
    expect(container.querySelector(".trapdoor-question-text")?.textContent).toBe(
      candidate.question,
    );

    const labels = [...container.querySelectorAll("button")].map(
      (button) => button.textContent,
    );
    expect(labels).toEqual([
      "继续拷打",
      "有东西",
      "答不上来",
      "什么破问题",
      "换一个",
    ]);
  });

  it("maps each question button to the correct callback", () => {
    const container = createContainer();
    const actions = makeActions();

    renderChallengeViewState(
      container,
      { kind: "question", candidate: makeCandidate(), debug: false },
      actions,
    );

    buttonByText(container, "继续拷打").click();
    buttonByText(container, "有东西").click();
    buttonByText(container, "答不上来").click();
    buttonByText(container, "什么破问题").click();
    buttonByText(container, "换一个").click();

    expect(actions.continueDrill).toHaveBeenCalledTimes(1);
    expect(actions.markUseful).toHaveBeenCalledTimes(1);
    expect(actions.markCannotAnswer).toHaveBeenCalledTimes(1);
    expect(actions.markBad).toHaveBeenCalledTimes(1);
    expect(actions.replace).toHaveBeenCalledTimes(1);
    expect(actions.markBad).not.toBe(actions.replace);
  });

  it("does not trigger business actions merely by rendering a question", () => {
    const container = createContainer();
    const actions = makeActions();

    renderChallengeViewState(
      container,
      { kind: "question", candidate: makeCandidate(), debug: false },
      actions,
    );

    for (const action of Object.values(actions)) {
      expect(action).not.toHaveBeenCalled();
    }
  });

  it("omits debug scores when debug is false", () => {
    const container = createContainer();

    renderChallengeViewState(
      container,
      { kind: "question", candidate: makeCandidate(), debug: false },
      makeActions(),
    );

    expect(container.querySelector(".trapdoor-debug")).toBeNull();
    expect(container.textContent).not.toContain("structure:");
  });

  it("shows category, template, and every score component when debug is true", () => {
    const container = createContainer();

    renderChallengeViewState(
      container,
      { kind: "question", candidate: makeCandidate(), debug: true },
      makeActions(),
    );

    const debug = container.querySelector(".trapdoor-debug")?.textContent ?? "";
    expect(debug).toContain("category: causal_gap");
    expect(debug).toContain("template: causal-gap-01");
    for (const key of [
      "structure",
      "centrality",
      "diagnosticity",
      "followupability",
      "novelty",
      "repetitionPenalty",
      "dislikePenalty",
      "explorationPenalty",
      "final",
    ]) {
      expect(debug).toContain(`${key}:`);
    }
  });

  it("debug output does not dump source text or API-key-like settings", () => {
    const container = createContainer();
    const candidate = makeCandidate({
      source: {
        ...makeCandidate().source,
        text: "sk-secret-value that must never be debug-dumped",
      },
    });

    renderChallengeViewState(
      container,
      { kind: "question", candidate, debug: true },
      makeActions(),
    );

    const debug = container.querySelector(".trapdoor-debug")?.textContent ?? "";
    expect(debug).not.toContain("sk-secret-value");
  });

  it("renders drill conversation in order with an accessible answer field", () => {
    const container = createContainer();
    const turns: DrillTurn[] = [
      { role: "user", content: "因为中间有一步状态转换。" },
      { role: "assistant", content: "这一步靠什么机制发生？" },
      { role: "user", content: "靠缓存失效。" },
    ];

    renderChallengeViewState(
      container,
      {
        kind: "drill",
        candidate: makeCandidate(),
        turns,
        currentQuestion: "什么证据能区分缓存失效和网络抖动？",
      },
      makeActions(),
    );

    const messages = [...container.querySelectorAll(".trapdoor-drill-message")].map(
      (node) => node.textContent,
    );
    expect(messages).toEqual([
      makeCandidate().question,
      "因为中间有一步状态转换。",
      "这一步靠什么机制发生？",
      "靠缓存失效。",
      "什么证据能区分缓存失效和网络抖动？",
    ]);

    const textarea = container.querySelector("textarea");
    expect(textarea?.getAttribute("aria-label")).toBe("回答当前追问");
  });

  it("does not submit an empty or whitespace-only drill answer", () => {
    const container = createContainer();
    const actions = makeActions();

    renderChallengeViewState(
      container,
      { kind: "drill", candidate: makeCandidate(), turns: [], currentQuestion: "为什么？" },
      actions,
    );

    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    const form = container.querySelector("form") as HTMLFormElement;

    textarea.value = "   \n  ";
    form.dispatchEvent(new form.ownerDocument.defaultView!.Event("submit", {
      bubbles: true,
      cancelable: true,
    }));

    expect(actions.submitDrillAnswer).not.toHaveBeenCalled();
  });

  it("submits one trimmed non-empty answer and prevents form reload", () => {
    const container = createContainer();
    const actions = makeActions();

    renderChallengeViewState(
      container,
      { kind: "drill", candidate: makeCandidate(), turns: [], currentQuestion: "为什么？" },
      actions,
    );

    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    const form = container.querySelector("form") as HTMLFormElement;
    textarea.value = "  因为这里省略了状态转换。  ";
    const event = new form.ownerDocument.defaultView!.Event("submit", {
      bubbles: true,
      cancelable: true,
    });

    expect(form.dispatchEvent(event)).toBe(false);
    expect(actions.submitDrillAnswer).toHaveBeenCalledTimes(1);
    expect(actions.submitDrillAnswer).toHaveBeenCalledWith("因为这里省略了状态转换。");
  });

  it("wires the drill exit action", () => {
    const container = createContainer();
    const actions = makeActions();

    renderChallengeViewState(
      container,
      { kind: "drill", candidate: makeCandidate(), turns: [], currentQuestion: "为什么？" },
      actions,
    );

    buttonByText(container, "退出拷打").click();
    expect(actions.exitDrill).toHaveBeenCalledTimes(1);
  });

  it("never renders orchestration sentinels", () => {
    const container = createContainer();

    renderChallengeViewState(
      container,
      {
        kind: "drill",
        candidate: makeCandidate(),
        turns: [
          { role: "assistant", content: "[[NEED_WHOLE_NOTE]]" },
          { role: "assistant", content: "[[DRILL_EXHAUSTED]]" },
        ],
        currentQuestion: "[[NEED_WHOLE_NOTE]]",
      },
      makeActions(),
    );

    expect(container.textContent).not.toContain("[[NEED_WHOLE_NOTE]]");
    expect(container.textContent).not.toContain("[[DRILL_EXHAUSTED]]");
  });

  it("shows exhausted copy and removes the submit affordance", () => {
    const container = createContainer();

    renderChallengeViewState(
      container,
      {
        kind: "drill",
        candidate: makeCandidate(),
        turns: [],
        exhaustedCopy: "这条路先挖到这。",
      },
      makeActions(),
    );

    expect(container.textContent).toContain("这条路先挖到这。");
    expect(container.querySelector("textarea")).toBeNull();
    expect(container.querySelector("form")).toBeNull();
    expect(container.textContent).not.toContain("[[DRILL_EXHAUSTED]]");
  });

  it("renders pit-saved acknowledgement and can request another challenge", () => {
    const container = createContainer();
    const actions = makeActions();

    renderChallengeViewState(
      container,
      { kind: "pit_saved", copy: "埋下了。", location: "当前小节" },
      actions,
    );

    expect(container.textContent).toContain("埋下了。");
    expect(container.textContent).toContain("当前小节");
    buttonByText(container, "再来一个").click();
    expect(actions.requestChallenge).toHaveBeenCalledTimes(1);
  });

  it("renders refusal copy without adding a manual override", () => {
    const container = createContainer();
    const actions = makeActions();

    renderChallengeViewState(
      container,
      { kind: "not_suitable", copy: "你已经在怀疑了。今天不用我推。" },
      actions,
    );

    expect(container.textContent).toContain("你已经在怀疑了。今天不用我推。");
    expect(container.textContent).not.toContain("还是问一个");
    buttonByText(container, "回去").click();
    expect(actions.returnToIdle).toHaveBeenCalledTimes(1);
  });

  it("treats copy as state data without consuming copy on rerender", () => {
    const container = createContainer();
    const nextCopy = vi.fn(() => "别装懂。按一下。" as string);
    const state: ChallengeViewState = { kind: "idle", copy: nextCopy() };

    renderChallengeViewState(container, state, makeActions());
    renderChallengeViewState(container, state, makeActions());

    expect(nextCopy).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("别装懂。按一下。");
  });

  it("does not show null or undefined when a source heading is absent", () => {
    const container = createContainer();
    const candidate = makeCandidate({
      source: { ...makeCandidate().source, heading: null },
    });

    renderChallengeViewState(
      container,
      { kind: "question", candidate, debug: false },
      makeActions(),
    );

    expect(container.textContent).not.toContain("null");
    expect(container.textContent).not.toContain("undefined");
    expect(container.textContent).toContain("来自：当前小节");
  });

  it("does not mutate candidate or drill turns while rendering", () => {
    const container = createContainer();
    const source = Object.freeze({ ...makeCandidate().source });
    const scores = Object.freeze({ ...makeCandidate().scores });
    const candidate = Object.freeze({ ...makeCandidate(), source, scores });
    const turns = Object.freeze([
      Object.freeze({ role: "user" as const, content: "我的回答" }),
    ]);

    expect(() =>
      renderChallengeViewState(
        container,
        { kind: "drill", candidate, turns, currentQuestion: "追问" },
        makeActions(),
      ),
    ).not.toThrow();
    expect(turns[0]?.content).toBe("我的回答");
    expect(candidate.question).toBe("“导致”这两个字省掉了哪两步？");
  });

  it("locks a rejected async action against duplicate clicks and handles rejection", async () => {
    const container = createContainer();
    let reject!: (reason?: unknown) => void;
    const pending = new Promise<void>((_resolve, rejectPromise) => {
      reject = rejectPromise;
    });
    const requestChallenge = vi.fn(() => pending);
    const actions = makeActions({ requestChallenge });

    renderChallengeViewState(container, { kind: "idle" }, actions);
    const button = buttonByText(container, "推我下去");
    button.click();
    button.click();

    expect(requestChallenge).toHaveBeenCalledTimes(1);
    expect(button.disabled).toBe(true);

    reject(new Error("controller owns error UI"));
    await pending.catch(() => undefined);
    await Promise.resolve();

    expect(button.disabled).toBe(false);
  });

  it("renders only the selected state without switch fallthrough", () => {
    const container = createContainer();
    const states: ChallengeViewState[] = [
      { kind: "idle" },
      { kind: "question", candidate: makeCandidate(), debug: false },
      { kind: "drill", candidate: makeCandidate(), turns: [], currentQuestion: "追问" },
      { kind: "pit_saved", copy: "埋下了。" },
      { kind: "not_suitable", copy: "今天不用我推。" },
    ];

    for (const state of states) {
      renderChallengeViewState(container, state, makeActions());
      expect(container.children).toHaveLength(1);
      expect(container.firstElementChild?.classList.contains(`trapdoor-state-${state.kind}`)).toBe(true);
    }
  });
});
