import { formatScoreDebug } from "../debug/debug-format";
import type { DrillTurn, QuestionCandidate } from "../domain/types";

export type IdleViewState = {
  kind: "idle";
  copy?: string;
  contextLabel?: string;
};

export type QuestionViewState = {
  kind: "question";
  candidate: QuestionCandidate;
  copy?: string;
  debug: boolean;
};

export type DrillViewState = {
  kind: "drill";
  candidate: QuestionCandidate;
  turns: readonly DrillTurn[];
  currentQuestion?: string;
  copy?: string;
  exhaustedCopy?: string;
};

export type PitSavedViewState = {
  kind: "pit_saved";
  copy: string;
  location?: string;
};

export type NotSuitableViewState = {
  kind: "not_suitable";
  copy: string;
};

export type ChallengeViewState =
  | IdleViewState
  | QuestionViewState
  | DrillViewState
  | PitSavedViewState
  | NotSuitableViewState;

export type ChallengeViewAction = () => void | Promise<void>;

export type ChallengeViewActions = {
  requestChallenge: ChallengeViewAction;
  continueDrill: ChallengeViewAction;
  markUseful: ChallengeViewAction;
  markCannotAnswer: ChallengeViewAction;
  markBad: ChallengeViewAction;
  replace: ChallengeViewAction;
  submitDrillAnswer: (answer: string) => void | Promise<void>;
  exitDrill: ChallengeViewAction;
  returnToIdle: ChallengeViewAction;
};

const INTERNAL_SENTINELS = ["[[NEED_WHOLE_NOTE]]", "[[DRILL_EXHAUSTED]]"] as const;

export function renderChallengeViewState(
  container: HTMLElement,
  state: ChallengeViewState,
  actions: ChallengeViewActions,
): void {
  const document = container.ownerDocument;
  const root = document.createElement("section");
  root.className = `trapdoor-view trapdoor-state-${state.kind}`;

  switch (state.kind) {
    case "idle":
      renderIdle(root, state, actions);
      break;
    case "question":
      renderQuestion(root, state, actions);
      break;
    case "drill":
      renderDrill(root, state, actions);
      break;
    case "pit_saved":
      renderPitSaved(root, state, actions);
      break;
    case "not_suitable":
      renderNotSuitable(root, state, actions);
      break;
    default:
      assertNever(state);
  }

  container.replaceChildren(root);
}

function renderIdle(
  root: HTMLElement,
  state: IdleViewState,
  actions: ChallengeViewActions,
): void {
  appendCopy(root, state.copy);
  if (state.contextLabel) {
    appendText(root, "div", state.contextLabel, "trapdoor-context");
  }

  appendButton(root, "推我下去", actions.requestChallenge, "trapdoor-primary-action");
}

function renderQuestion(
  root: HTMLElement,
  state: QuestionViewState,
  actions: ChallengeViewActions,
): void {
  appendCopy(root, state.copy);
  appendText(root, "div", sourceLabel(state.candidate), "trapdoor-source");
  appendText(root, "div", state.candidate.question, "trapdoor-question-text");

  const actionBar = root.ownerDocument.createElement("div");
  actionBar.className = "trapdoor-question-actions";
  appendButton(actionBar, "继续拷打", actions.continueDrill);
  appendButton(actionBar, "有东西", actions.markUseful);
  appendButton(actionBar, "答不上来", actions.markCannotAnswer);
  appendButton(actionBar, "什么破问题", actions.markBad);
  appendButton(actionBar, "换一个", actions.replace);
  root.append(actionBar);

  if (state.debug) {
    const debug = root.ownerDocument.createElement("pre");
    debug.className = "trapdoor-debug";
    debug.textContent = [
      `category: ${state.candidate.category}`,
      `template: ${state.candidate.templateId}`,
      formatScoreDebug(state.candidate),
    ].join("\n");
    root.append(debug);
  }
}

function renderDrill(
  root: HTMLElement,
  state: DrillViewState,
  actions: ChallengeViewActions,
): void {
  appendCopy(root, state.copy);

  const conversation = root.ownerDocument.createElement("div");
  conversation.className = "trapdoor-drill-conversation";
  appendDrillMessage(conversation, state.candidate.question, "challenge");

  for (const turn of state.turns) {
    appendDrillMessage(conversation, turn.content, turn.role);
  }

  if (state.currentQuestion) {
    appendDrillMessage(conversation, state.currentQuestion, "assistant");
  }

  root.append(conversation);

  if (state.exhaustedCopy) {
    appendText(root, "div", state.exhaustedCopy, "trapdoor-drill-exhausted");
  } else {
    const form = root.ownerDocument.createElement("form");
    form.className = "trapdoor-drill-form";

    const label = root.ownerDocument.createElement("label");
    label.className = "trapdoor-answer-label";
    label.textContent = "你的回答";

    const textarea = root.ownerDocument.createElement("textarea");
    textarea.className = "trapdoor-answer";
    textarea.setAttribute("aria-label", "回答当前追问");
    label.append(textarea);
    form.append(label);

    const submit = root.ownerDocument.createElement("button");
    submit.type = "submit";
    submit.textContent = "继续";
    form.append(submit);

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const answer = textarea.value.trim();
      if (!answer) {
        return;
      }
      executeLocked(submit, () => actions.submitDrillAnswer(answer));
    });

    root.append(form);
  }

  appendButton(root, "退出拷打", actions.exitDrill, "trapdoor-exit-drill");
}

function renderPitSaved(
  root: HTMLElement,
  state: PitSavedViewState,
  actions: ChallengeViewActions,
): void {
  appendText(root, "div", state.copy, "trapdoor-acknowledgement");
  if (state.location) {
    appendText(root, "div", state.location, "trapdoor-location");
  }
  appendButton(root, "再来一个", actions.requestChallenge, "trapdoor-primary-action");
}

function renderNotSuitable(
  root: HTMLElement,
  state: NotSuitableViewState,
  actions: ChallengeViewActions,
): void {
  appendText(root, "div", state.copy, "trapdoor-refusal");
  appendButton(root, "回去", actions.returnToIdle);
}

function appendCopy(root: HTMLElement, copy: string | undefined): void {
  if (copy) {
    appendText(root, "div", copy, "trapdoor-copy");
  }
}

function appendText(
  root: HTMLElement,
  tag: "div" | "span",
  text: string,
  className: string,
): HTMLElement {
  const element = root.ownerDocument.createElement(tag);
  element.className = className;
  element.textContent = text;
  root.append(element);
  return element;
}

function appendButton(
  root: HTMLElement,
  label: string,
  action: ChallengeViewAction,
  className?: string,
): HTMLButtonElement {
  const button = root.ownerDocument.createElement("button");
  button.type = "button";
  button.textContent = label;
  if (className) {
    button.className = className;
  }
  button.addEventListener("click", () => executeLocked(button, action));
  root.append(button);
  return button;
}

function executeLocked(button: HTMLButtonElement, action: ChallengeViewAction): void {
  if (button.disabled) {
    return;
  }

  button.disabled = true;
  let result: void | Promise<void>;
  try {
    result = action();
  } catch {
    button.disabled = false;
    return;
  }

  void Promise.resolve(result)
    .catch(() => undefined)
    .finally(() => {
      button.disabled = false;
    });
}

function appendDrillMessage(
  root: HTMLElement,
  content: string,
  role: "challenge" | DrillTurn["role"],
): void {
  const visible = stripInternalSentinels(content);
  if (!visible) {
    return;
  }

  const message = root.ownerDocument.createElement("div");
  message.className = `trapdoor-drill-message trapdoor-drill-${role}`;
  message.textContent = visible;
  root.append(message);
}

function stripInternalSentinels(content: string): string {
  let visible = content;
  for (const sentinel of INTERNAL_SENTINELS) {
    visible = visible.replaceAll(sentinel, "");
  }
  return visible.trim();
}

function sourceLabel(candidate: QuestionCandidate): string {
  if (candidate.source.scope === "note") {
    return "来自：整篇";
  }
  return candidate.source.heading
    ? `来自：当前小节 · ${candidate.source.heading}`
    : "来自：当前小节";
}

function assertNever(value: never): never {
  throw new Error(`Unhandled challenge view state: ${String(value)}`);
}
